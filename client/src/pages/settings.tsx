import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { User, Settings2, Building2, CreditCard, Bell, MessageSquare, MapPin, Globe, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TaglineGenerator } from "@/components/TaglineGenerator";
import { ProviderSelection } from "@/components/provider-selection";
import { WhatsAppProviderSelection } from "@/components/WhatsAppProviderSelection";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { whatsappHelpContent } from "@/data/whatsapp-help-content";

// Utility function to convert any image format to PNG
const convertImageToPNG = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // Clean up object URL
      URL.revokeObjectURL(img.src);
      
      // Set canvas dimensions to image dimensions
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw image on canvas
      ctx?.drawImage(img, 0, 0);
      
      // Convert to PNG format (data URL)
      const pngDataUrl = canvas.toDataURL('image/png', 0.9);
      resolve(pngDataUrl);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    
    // Create object URL for the uploaded file and set as image source
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
  });
};

const settingsFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  businessName: z.string().min(1, "Business name is required"),
  businessAddress: z.string().optional(),
  businessPhone: z.string().optional(),
  phoneNumber: z.string().optional(),
  preferredCurrency: z.string().min(1, "Currency is required"),
  timezone: z.string().optional(),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
});

const businessFormSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  businessAddress: z.string().optional(),
  businessPhone: z.string().optional(),
  preferredCurrency: z.string().min(1, "Currency is required"),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  logoType: z.enum(["initials", "business", "custom"]).optional(),
  logoUrl: z.string().optional(),
  storeTagline: z.string().optional(),
});

type SettingsFormData = z.infer<typeof settingsFormSchema>;
type BusinessFormData = z.infer<typeof businessFormSchema>;

// Comprehensive list of supported currencies
const CURRENCIES = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr" },
  { code: "DKK", name: "Danish Krone", symbol: "kr" },
  { code: "PLN", name: "Polish Zloty", symbol: "zł" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft" },
  { code: "RON", name: "Romanian Leu", symbol: "lei" },
  { code: "BGN", name: "Bulgarian Lev", symbol: "лв" },
  { code: "HRK", name: "Croatian Kuna", symbol: "kn" },
  { code: "RUB", name: "Russian Ruble", symbol: "₽" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "BRL", name: "Brazilian Real", symbol: "R$" },
  { code: "MXN", name: "Mexican Peso", symbol: "$" },
  { code: "ARS", name: "Argentine Peso", symbol: "$" },
  { code: "CLP", name: "Chilean Peso", symbol: "$" },
  { code: "COP", name: "Colombian Peso", symbol: "$" },
  { code: "PEN", name: "Peruvian Sol", symbol: "S/" },
  { code: "KRW", name: "South Korean Won", symbol: "₩" },
  { code: "THB", name: "Thai Baht", symbol: "฿" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼" },
  { code: "QAR", name: "Qatari Riyal", symbol: "ر.ق" },
  { code: "KWD", name: "Kuwaiti Dinar", symbol: "د.ك" },
  { code: "BHD", name: "Bahraini Dinar", symbol: ".د.ب" },
  { code: "OMR", name: "Omani Rial", symbol: "ر.ع." },
  { code: "JOD", name: "Jordanian Dinar", symbol: "د.ا" },
  { code: "LBP", name: "Lebanese Pound", symbol: "ل.ل" },
  { code: "EGP", name: "Egyptian Pound", symbol: "£" },
  { code: "MAD", name: "Moroccan Dirham", symbol: "د.م." },
  { code: "TND", name: "Tunisian Dinar", symbol: "د.ت" },
  { code: "DZD", name: "Algerian Dinar", symbol: "د.ج" },
  { code: "LYD", name: "Libyan Dinar", symbol: "ل.د" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵" },
  { code: "KES", name: "Kenyan Shilling", symbol: "Sh" },
  { code: "UGX", name: "Ugandan Shilling", symbol: "Sh" },
  { code: "TZS", name: "Tanzanian Shilling", symbol: "Sh" },
  { code: "ETB", name: "Ethiopian Birr", symbol: "Br" },
  { code: "XOF", name: "West African CFA Franc", symbol: "Fr" },
  { code: "XAF", name: "Central African CFA Franc", symbol: "Fr" },
];

function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("account");

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      businessName: user?.businessName || "",
      businessAddress: user?.businessAddress || "",
      businessPhone: user?.businessPhone || "",
      phoneNumber: user?.phoneNumber || "",
      preferredCurrency: user?.preferredCurrency || "GBP",
      timezone: user?.timezone || "UTC",
      streetAddress: user?.streetAddress || "",
      city: user?.city || "",
      state: user?.state || "",
      postalCode: user?.postalCode || "",
      country: user?.country || "United Kingdom",
    },
  });

  const businessForm = useForm<BusinessFormData>({
    resolver: zodResolver(businessFormSchema),
    defaultValues: {
      businessName: user?.businessName || "Lanre Foods",
      businessAddress: user?.businessAddress || "",
      businessPhone: user?.businessPhone || "",
      preferredCurrency: user?.preferredCurrency || "GBP",
      streetAddress: user?.streetAddress || "",
      city: user?.city || "",
      state: user?.state || "",
      postalCode: user?.postalCode || "",
      country: user?.country || "United Kingdom",
      logoType: (user?.logoType as "custom" | "initials" | "business") || "initials",
      logoUrl: user?.logoUrl || "",
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      const response = await apiRequest("PATCH", "/api/settings", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings Updated",
        description: "Your settings have been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateBusinessMutation = useMutation({
    mutationFn: async (data: BusinessFormData) => {
      const response = await apiRequest("PATCH", "/api/settings", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Business Information Updated",
        description: "Your business information has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    updateSettingsMutation.mutate(data);
  };

  const onBusinessSubmit = (data: BusinessFormData) => {
    updateBusinessMutation.mutate(data);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Manage your account preferences and business settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Settings Navigation */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-6">
              <nav className="space-y-2">
                <div 
                  className={`flex items-center p-3 rounded-lg cursor-pointer ${
                    activeTab === "account" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("account")}
                >
                  <User className="h-5 w-5 mr-3" />
                  <span className="font-medium">Account</span>
                </div>
                <div 
                  className={`flex items-center p-3 rounded-lg cursor-pointer ${
                    activeTab === "business" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("business")}
                >
                  <Building2 className="h-5 w-5 mr-3" />
                  <span>Business</span>
                </div>
                <div 
                  className={`flex items-center p-3 rounded-lg cursor-pointer ${
                    activeTab === "billing" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("billing")}
                >
                  <CreditCard className="h-5 w-5 mr-3" />
                  <span>Payments</span>
                </div>
                <div 
                  className={`flex items-center p-3 rounded-lg cursor-pointer ${
                    activeTab === "notifications" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("notifications")}
                >
                  <Bell className="h-5 w-5 mr-3" />
                  <span>Notifications</span>
                </div>
                <div 
                  className={`flex items-center p-3 rounded-lg cursor-pointer ${
                    activeTab === "whatsapp" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("whatsapp")}
                >
                  <MessageSquare className="h-5 w-5 mr-3" />
                  <span>WhatsApp Integration</span>
                </div>
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Settings Form */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings2 className="h-6 w-6 mr-2" />
                {activeTab === "account" && "Account Settings"}
                {activeTab === "business" && "Business Settings"}
                {activeTab === "billing" && "Billing & Subscription"}
                {activeTab === "notifications" && "Notification Settings"}
                {activeTab === "whatsapp" && "WhatsApp Integration"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeTab === "account" && (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Personal Information</h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>First Name</FormLabel>
                              <FormControl>
                                <Input {...field} />
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
                              <FormLabel>Last Name</FormLabel>
                              <FormControl>
                                <Input {...field} />
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
                            <FormLabel>Email Address</FormLabel>
                            <FormControl>
                              <Input {...field} type="email" disabled />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="pt-6">
                      <Button 
                        type="submit" 
                        disabled={updateSettingsMutation.isPending}
                        className="min-w-[120px]"
                      >
                        {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}

              {activeTab === "business" && (
                <Form {...businessForm}>
                  <form onSubmit={businessForm.handleSubmit(onBusinessSubmit)} className="space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Building2 className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-medium">Company Information</h3>
                      </div>
                      <p className="text-gray-600 mb-6">Manage your business profile, location, and currency settings.</p>
                      
                      {/* Business Name */}
                      <FormField
                        control={businessForm.control}
                        name="businessName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Name *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter your business name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Business Description */}
                      <FormField
                        control={businessForm.control}
                        name="businessAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Description</FormLabel>
                            <FormControl>
                              <Textarea 
                                {...field} 
                                placeholder="Brief description of your business"
                                className="min-h-[100px]"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Store Tagline with AI Generator */}
                      <TaglineGenerator
                        currentTagline={businessForm.watch("storeTagline") || "Premium wholesale products"}
                        onTaglineSelect={(tagline) => businessForm.setValue("storeTagline", tagline)}
                        businessName={businessForm.watch("businessName")}
                        businessDescription={businessForm.watch("businessAddress")}
                      />

                      {/* Contact Information */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mt-6 mb-4">
                          <MapPin className="h-5 w-5 text-primary" />
                          <h4 className="text-md font-medium">Contact Information</h4>
                        </div>

                        <FormField
                          control={businessForm.control}
                          name="businessPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Phone</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="+44 1234 567890" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Address Fields */}
                        <FormField
                          control={businessForm.control}
                          name="streetAddress"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Street Address</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="123 Business Street" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={businessForm.control}
                            name="city"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>City</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="London" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={businessForm.control}
                            name="state"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>State/Province</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="England" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={businessForm.control}
                            name="postalCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Postal Code</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="SW1A 1AA" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={businessForm.control}
                            name="country"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Country</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder="United Kingdom" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Logo Settings */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mt-6 mb-4">
                          <User className="h-5 w-5 text-primary" />
                          <h4 className="text-md font-medium">Business Logo</h4>
                        </div>

                        <FormField
                          control={businessForm.control}
                          name="logoType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Logo Display Option</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value || "initials"}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Choose how to display your logo" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="initials">Name Initials (Default)</SelectItem>
                                  <SelectItem value="business">Business Name Initials</SelectItem>
                                  <SelectItem value="custom">Custom Logo Upload</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {businessForm.watch("logoType") === "custom" && (
                          <FormField
                            control={businessForm.control}
                            name="logoUrl"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Upload Logo</FormLabel>
                                <FormControl>
                                  <div className="space-y-2">
                                    <Input
                                      type="file"
                                      accept="image/*"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          try {
                                            const convertedDataUrl = await convertImageToPNG(file);
                                            field.onChange(convertedDataUrl);
                                          } catch (error) {
                                            console.error('Error converting image:', error);
                                            toast({
                                              title: "Error",
                                              description: "Failed to process image. Please try again.",
                                              variant: "destructive",
                                            });
                                          }
                                        }
                                      }}
                                      className="cursor-pointer"
                                    />
                                    {field.value && (
                                      <div className="flex items-center gap-2">
                                        <img
                                          src={field.value}
                                          alt="Logo preview"
                                          className="h-12 w-12 object-cover rounded border"
                                        />
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          onClick={() => field.onChange("")}
                                        >
                                          Remove
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        )}

                        <div className="space-y-3">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                              <User className="h-4 w-4 text-blue-600 mt-1" />
                              <div>
                                <p className="text-sm text-blue-800 font-medium">Logo Hierarchy</p>
                                <p className="text-sm text-blue-700 mt-1">
                                  Custom logo → Business name initials → Your name initials (MO). The logo will appear in the header replacing "MO".
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 text-green-600 mt-1" />
                              <div>
                                <p className="text-sm text-green-800 font-medium">Image Format Support</p>
                                <p className="text-sm text-green-700 mt-1">
                                  All image formats (including WebP, JPEG, PNG) are automatically converted to PNG for optimal compatibility and display quality.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Currency Settings */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 mt-6 mb-4">
                          <Globe className="h-5 w-5 text-primary" />
                          <h4 className="text-md font-medium">Currency & Localization</h4>
                        </div>

                        <FormField
                          control={businessForm.control}
                          name="preferredCurrency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Default Currency *</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select your default currency" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent className="max-h-60">
                                  {CURRENCIES.map((currency) => (
                                    <SelectItem key={currency.code} value={currency.code}>
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono text-sm">{currency.symbol}</span>
                                        <span>{currency.code}</span>
                                        <span className="text-gray-500">- {currency.name}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-sm text-gray-500 mt-1">
                                This will be the default currency for new products and pricing displays
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-start gap-2">
                            <Globe className="h-4 w-4 text-blue-600 mt-1" />
                            <div>
                              <p className="text-sm text-blue-800 font-medium">Multi-Currency Support</p>
                              <p className="text-sm text-blue-700 mt-1">
                                Your default currency will be used for new products. You can still create products in different currencies when needed.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-6 border-t">
                      <Button 
                        type="submit" 
                        disabled={updateBusinessMutation.isPending}
                        className="min-w-[120px]"
                      >
                        {updateBusinessMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}

              {activeTab === "billing" && (
                <StripeConnectSection />
              )}

              {activeTab === "notifications" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Notification Preferences</h3>
                    <p className="text-gray-600">Choose how you want to receive notifications.</p>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-gray-800">Notification settings coming soon.</p>
                  </div>
                </div>
              )}

              {activeTab === "whatsapp" && (
                <WhatsAppIntegrationSection />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function WhatsAppIntegrationSection() {
  const { toast } = useToast();
  const [testPhoneNumber, setTestPhoneNumber] = useState("");
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [showProviderSelection, setShowProviderSelection] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'twilio' | 'direct'>('twilio');
  const [twilioConfig, setTwilioConfig] = useState({
    accountSid: "",
    authToken: "", 
    phoneNumber: ""
  });
  const [directConfig, setDirectConfig] = useState({
    businessPhoneId: "",
    accessToken: "",
    appId: "",
    businessPhone: "",
    businessName: ""
  });

  // Fetch WhatsApp status
  const { data: whatsappStatus, isLoading } = useQuery({
    queryKey: ["/api/whatsapp/status"],
  });

  // Populate form when editing existing configuration
  useEffect(() => {
    if (whatsappStatus) {
      // Set the current provider from backend data
      setSelectedProvider(whatsappStatus.whatsappProvider || 'twilio');
      
      // Populate Twilio config
      setTwilioConfig({
        accountSid: whatsappStatus.twilioAccountSid || "",
        authToken: whatsappStatus.twilioAuthToken === "configured" ? "" : whatsappStatus.twilioAuthToken || "",
        phoneNumber: whatsappStatus.twilioPhoneNumber || ""
      });
      
      // Populate Direct WhatsApp config
      setDirectConfig({
        businessPhoneId: whatsappStatus.whatsappBusinessPhoneId || "",
        accessToken: whatsappStatus.whatsappAccessToken === "configured" ? "" : whatsappStatus.whatsappAccessToken || "",
        appId: whatsappStatus.whatsappAppId || "",
        businessPhone: whatsappStatus.whatsappBusinessPhone || "",
        businessName: whatsappStatus.whatsappBusinessName || ""
      });
    }
  }, [whatsappStatus]);

  // Save WhatsApp configuration mutation
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const config = {
        provider: selectedProvider,
        ...(selectedProvider === 'twilio' ? twilioConfig : directConfig)
      };
      return await apiRequest("POST", "/api/whatsapp/configure", config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      setIsEditingConfig(false);
      toast({
        title: "Configuration Saved",
        description: "Twilio WhatsApp configuration saved successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Verify WhatsApp configuration mutation
  const verifyConfigMutation = useMutation({
    mutationFn: async () => {
      const config = {
        provider: selectedProvider,
        ...(selectedProvider === 'twilio' ? twilioConfig : directConfig)
      };
      return await apiRequest("POST", "/api/whatsapp/verify", config);
    },
    onSuccess: () => {
      toast({
        title: "Verification Successful",
        description: "Twilio WhatsApp configuration verified successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Test WhatsApp mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/whatsapp/test", {
        testPhoneNumber
      });
    },
    onSuccess: () => {
      toast({
        title: "Test Message Sent",
        description: "WhatsApp test message sent successfully!",
      });
      setTestPhoneNumber("");
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleSaveTwilioConfig = () => {
    if (!twilioConfig.accountSid || !twilioConfig.authToken || !twilioConfig.phoneNumber) {
      toast({
        title: "Missing Information",
        description: "Please provide Twilio Account SID, Auth Token, and WhatsApp phone number.",
        variant: "destructive",
      });
      return;
    }
    saveConfigMutation.mutate(twilioConfig);
  };

  const handleVerifyTwilioConfig = () => {
    if (!twilioConfig.accountSid || !twilioConfig.authToken || !twilioConfig.phoneNumber) {
      toast({
        title: "Missing Information",
        description: "Please provide Twilio Account SID, Auth Token, and WhatsApp phone number.",
        variant: "destructive",
      });
      return;
    }
    verifyConfigMutation.mutate(twilioConfig);
  };

  const handleTest = () => {
    if (!testPhoneNumber) {
      toast({
        title: "Phone Number Required",
        description: "Please enter a phone number to test.",
        variant: "destructive",
      });
      return;
    }
    testMutation.mutate();
  };

  if (isLoading) {
    return <div>Loading WhatsApp integration status...</div>;
  }

  const isConfigured = whatsappStatus?.whatsappProvider === 'direct' 
    ? (whatsappStatus?.whatsappBusinessPhoneId && whatsappStatus?.whatsappAccessToken && whatsappStatus?.whatsappAppId)
    : (whatsappStatus?.twilioAccountSid && whatsappStatus?.twilioAuthToken && whatsappStatus?.twilioPhoneNumber);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium">WhatsApp Integration</h3>
          <ContextualHelpBubble
            topic="WhatsApp troubleshooting"
            title="Common WhatsApp Issues"
            steps={whatsappHelpContent.troubleshooting.steps}
            position="right"
          />
          <ContextualHelpBubble
            topic="WhatsApp best practices"
            title="WhatsApp Messaging Best Practices"
            steps={whatsappHelpContent.bestPractices.steps}
            position="right"
          />
        </div>
        <p className="text-gray-600 text-sm">
          Choose your WhatsApp integration method and configure your credentials to send product broadcasts and updates to customer groups.
        </p>

        {!isConfigured && !showProviderSelection && !isEditingConfig ? (
          <div className="text-center space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <MessageSquare className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <div className="flex items-center justify-center gap-2 mb-2">
                <h4 className="text-lg font-medium text-blue-900">Set Up WhatsApp Integration</h4>
                <ContextualHelpBubble
                  topic="getting started"
                  title="Getting Started with WhatsApp"
                  steps={[
                    {
                      title: "Why WhatsApp Integration?",
                      content: "WhatsApp is the world's most popular messaging app with over 2 billion users. Integrating WhatsApp allows you to reach customers directly with product updates, order notifications, and marketing campaigns.",
                      tip: "WhatsApp messages have a 98% open rate compared to 20% for emails - it's the most effective way to reach customers."
                    },
                    {
                      title: "What You Can Do",
                      content: "Send product broadcasts to customer groups, notify customers about new stock arrivals, send order confirmations and delivery updates, and enable direct customer communication.",
                      tip: "Start with order notifications - customers love real-time updates about their purchases."
                    },
                    {
                      title: "Choosing Your Provider",
                      content: "You'll choose between Twilio (easy setup, great for beginners) or Direct WhatsApp API (lower costs, better for high volume). We'll guide you through the decision and setup process.",
                      tip: "Don't worry about choosing wrong - you can always switch providers later as your business grows."
                    }
                  ]}
                  position="bottom"
                />
              </div>
              <p className="text-blue-700 mb-4">
                Connect WhatsApp to send product broadcasts and updates to your customers.
              </p>
              <Button 
                onClick={() => setShowProviderSelection(true)}
                className="bg-green-600 hover:bg-green-700"
              >
                Get Started with WhatsApp
              </Button>
            </div>
          </div>
        ) : showProviderSelection ? (
          <WhatsAppProviderSelection
            onSelectProvider={(provider) => {
              setSelectedProvider(provider);
              setShowProviderSelection(false);
              setIsEditingConfig(true);
            }}
            onCancel={() => setShowProviderSelection(false)}
          />
        ) : (isEditingConfig || !isConfigured) ? (
          <ProviderSelection
            selectedProvider={selectedProvider}
            onProviderChange={setSelectedProvider}
            twilioConfig={twilioConfig}
            directConfig={directConfig}
            onTwilioConfigChange={setTwilioConfig}
            onDirectConfigChange={setDirectConfig}
            onSave={handleSaveWhatsAppConfig}
            onVerify={handleVerifyWhatsAppConfig}
            onCancel={() => {
              setIsEditingConfig(false);
              setShowProviderSelection(false);
            }}
            isSaving={saveConfigMutation.isPending}
            isVerifying={verifyConfigMutation.isPending}
          />
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-800 font-medium">
                  ✅ {whatsappStatus?.serviceProvider} is configured and ready to use!
                </p>
                <p className="text-green-700 text-sm mt-1">
                  {whatsappStatus?.whatsappProvider === 'direct' 
                    ? `Business Phone: ${whatsappStatus?.whatsappBusinessPhone}` 
                    : `WhatsApp Phone: ${whatsappStatus?.twilioPhoneNumber}`}
                </p>
                <p className="text-green-700 text-sm">
                  You can now create campaigns and send messages to your customer groups.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowProviderSelection(true)}
                  variant="outline"
                  size="sm"
                  className="text-blue-700 border-blue-300 hover:bg-blue-100"
                >
                  Change Provider
                </Button>
                <Button
                  onClick={() => setIsEditingConfig(true)}
                  variant="outline"
                  size="sm"
                  className="text-green-700 border-green-300 hover:bg-green-100"
                >
                  Edit Configuration
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {isConfigured && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium">Test Integration</h3>
            <ContextualHelpBubble
              topic="testing WhatsApp"
              title="Testing Your WhatsApp Integration"
              steps={[
                {
                  title: "Test Message Purpose",
                  content: "Sending a test message helps verify that your WhatsApp integration is working correctly before you start sending to customers. It's like a practice run.",
                  tip: "Always test with your own number first to see exactly what your customers will receive."
                },
                {
                  title: "Phone Number Format",
                  content: "Enter the phone number in international format: +[country code][number]. For example, +1234567890 for US numbers or +447891234567 for UK numbers.",
                  tip: "Don't include spaces, dashes, or parentheses - just the + symbol and numbers."
                },
                {
                  title: "Sandbox vs Production",
                  content: "If using Twilio sandbox, remember the recipient must have joined your sandbox first by texting your sandbox code. Production numbers work immediately.",
                  tip: "For Twilio sandbox testing, use the number +14155238886 and make sure you've joined your own sandbox."
                }
              ]}
              position="right"
            />
          </div>
          <p className="text-gray-600 text-sm">
            Send a test message to verify your WhatsApp Business API integration is working correctly.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Enter phone number (e.g., +1234567890)"
              value={testPhoneNumber}
              onChange={(e) => setTestPhoneNumber(e.target.value)}
            />
            <Button 
              onClick={handleTest}
              disabled={!testPhoneNumber || testMutation.isPending}
            >
              {testMutation.isPending ? "Sending..." : "Send Test Message"}
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Test messages will be sent from your configured WhatsApp Business number.
          </p>
        </div>
      )}

      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-600 mt-1" />
          <div>
            <p className="text-sm text-orange-800 font-medium">Sandbox Mode Active</p>
            <p className="text-sm text-orange-700 mt-1">
              You're using Twilio sandbox (+14155238886). Messages only reach numbers that have joined your sandbox by texting "join [your-code]" to +1 (415) 523-8886. For production broadcasts to all customers, apply for WhatsApp Business API approval through Twilio.
            </p>
            <p className="text-xs text-orange-600 mt-2 font-medium">
              💡 Tip: Find your sandbox code in Twilio Console → Messaging → WhatsApp → Sandbox
            </p>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-3">📚 Twilio WhatsApp Setup Guide</h4>
        <div className="text-sm text-gray-600 space-y-3">
          <div>
            <p className="font-medium text-gray-800 mb-1">For Testing (Sandbox Mode):</p>
            <div className="space-y-1 ml-3">
              <p><strong>Step 1:</strong> Create a free Twilio account at <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">twilio.com</a></p>
              <p><strong>Step 2:</strong> Go to Console → Messaging → WhatsApp → Sandbox</p>
              <p><strong>Step 3:</strong> Find your sandbox code (e.g., "join happy-cat")</p>
              <p><strong>Step 4:</strong> Get your Account SID and Auth Token from Console Dashboard</p>
              <p><strong>Step 5:</strong> Use phone number: <code className="bg-gray-200 px-1 rounded">+14155238886</code></p>
              <p><strong>Step 6:</strong> Add credentials above and test!</p>
            </div>
          </div>
          
          <div className="border-t pt-3">
            <p className="font-medium text-gray-800 mb-1">For Production:</p>
            <div className="space-y-1 ml-3">
              <p><strong>Step 1:</strong> Apply for WhatsApp Business API approval through Twilio</p>
              <p><strong>Step 2:</strong> Get your business verified and phone number approved</p>
              <p><strong>Step 3:</strong> Use your approved business phone number instead of sandbox</p>
              <p><strong>Step 4:</strong> Customers can message you directly without joining sandbox</p>
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded p-2 mt-3">
            <p className="text-xs text-blue-800"><strong>Important:</strong> In sandbox mode, only numbers that have texted "join [your-code]" to +1 (415) 523-8886 will receive messages. Test with your own number first!</p>
          </div>
          
          <div className="bg-green-50 border border-green-200 rounded p-3 mt-3">
            <h5 className="font-medium text-green-800 mb-2">Quick Reference - Finding Your Credentials:</h5>
            <div className="text-xs text-green-700 space-y-1">
              <p><strong>Account SID:</strong> Twilio Console Dashboard → "Account SID" (starts with "AC")</p>
              <p><strong>Auth Token:</strong> Twilio Console Dashboard → "Auth Token" (click "Show" to reveal)</p>
              <p><strong>Sandbox Code:</strong> Console → Messaging → WhatsApp → Sandbox → "join [your-unique-code]"</p>
              <p><strong>Phone Number:</strong> Always use +14155238886 for sandbox testing</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StripeConnectSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch Stripe Connect status
  const { data: stripeStatus, isLoading } = useQuery({
    queryKey: ["/api/stripe/connect-status"],
  });

  // Start onboarding mutation
  const startOnboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/connect-onboarding");
      return response.json();
    },
    onSuccess: (data) => {
      // Redirect to Stripe onboarding
      window.location.href = data.onboardingUrl;
    },
    onError: (error: any) => {
      toast({
        title: "Onboarding Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Payment Setup</h3>
        <p className="text-gray-600">Set up your payment processing to receive payments from customers.</p>
      </div>

      {user?.role === 'wholesaler' ? (
        <div className="space-y-4">
          {/* Stripe Connect Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CreditCard className="mr-2 h-5 w-5" />
                Stripe Connect Account
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!stripeStatus?.hasAccount ? (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Setup Payment Processing</h4>
                    <p className="text-blue-800 mb-4">
                      To receive payments from customers, you need to set up a Stripe Connect account. 
                      This allows Quikpik to securely process payments and transfer funds to your bank account.
                    </p>
                    <div className="text-sm text-blue-700 space-y-1">
                      <p>• Secure payment processing</p>
                      <p>• Automatic fund transfers to your bank</p>
                      <p>• Quikpik handles all payment security</p>
                      <p>• 5% platform fee on successful transactions</p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => startOnboardingMutation.mutate()}
                    disabled={startOnboardingMutation.isPending}
                    className="w-full"
                  >
                    {startOnboardingMutation.isPending ? "Setting up..." : "Set up Payment Processing"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div>
                      <h4 className="font-medium text-green-900">
                        {stripeStatus.paymentsEnabled ? "✓ Payment Processing Active" : "⚠ Account Setup Required"}
                      </h4>
                      <p className="text-green-800 text-sm">
                        {stripeStatus.paymentsEnabled 
                          ? "Your account is ready to accept payments" 
                          : "Please complete your account setup to accept payments"}
                      </p>
                    </div>
                    {!stripeStatus.paymentsEnabled && (
                      <Button 
                        onClick={() => startOnboardingMutation.mutate()}
                        disabled={startOnboardingMutation.isPending}
                        size="sm"
                      >
                        Complete Setup
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">Account Status</div>
                      <div className="font-medium">
                        {stripeStatus.detailsSubmitted ? "✓ Verified" : "⚠ Pending"}
                      </div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">Payment Processing</div>
                      <div className="font-medium">
                        {stripeStatus.paymentsEnabled ? "✓ Enabled" : "⚠ Disabled"}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Revenue Information */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue & Fees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">How Payment Processing Works</h4>
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>• Customers pay the full order amount (including our 5% platform fee)</p>
                    <p>• Quikpik collects the 5% platform fee to maintain and improve the platform</p>
                    <p>• You receive 95% of the order value directly to your bank account</p>
                    <p>• All transactions are secure and PCI-compliant through Stripe</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm text-green-600">You Keep</div>
                    <div className="font-bold text-green-900">95%</div>
                    <div className="text-xs text-green-700">of order value</div>
                  </div>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm text-blue-600">Platform Fee</div>
                    <div className="font-bold text-blue-900">5%</div>
                    <div className="text-xs text-blue-700">for platform services</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-gray-800">Payment processing setup is only available for wholesaler accounts.</p>
        </div>
      )}
    </div>
  );
}

export default Settings;