import { useState } from "react";
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
import { User, Settings2, Building2, CreditCard, Bell, MessageSquare } from "lucide-react";

const settingsFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  businessName: z.string().optional(),
  businessAddress: z.string().optional(),
  businessPhone: z.string().optional(),
  phoneNumber: z.string().optional(),
  preferredCurrency: z.string().min(1, "Currency is required"),
  timezone: z.string().optional(),
});

type SettingsFormData = z.infer<typeof settingsFormSchema>;

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
      preferredCurrency: user?.preferredCurrency || "GBP",
      timezone: user?.timezone || "UTC",
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

  const onSubmit = (data: SettingsFormData) => {
    updateSettingsMutation.mutate(data);
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
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Business Information</h3>
                    <p className="text-gray-600">Manage your business profile and settings.</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800">Business settings coming soon. Contact support for custom business configurations.</p>
                  </div>
                </div>
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
  const [whatsappConfig, setWhatsappConfig] = useState({
    businessPhone: "",
    apiToken: "",
    businessName: ""
  });

  // Fetch WhatsApp status
  const { data: whatsappStatus, isLoading } = useQuery({
    queryKey: ["/api/whatsapp/status"],
  });

  // Save WhatsApp configuration mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (config: typeof whatsappConfig) => {
      return await apiRequest("POST", "/api/whatsapp/configure", config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      toast({
        title: "Configuration Saved",
        description: "WhatsApp Business API configuration saved successfully!",
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
    mutationFn: async (config: typeof whatsappConfig) => {
      return await apiRequest("POST", "/api/whatsapp/verify", config);
    },
    onSuccess: () => {
      toast({
        title: "Verification Successful",
        description: "WhatsApp Business API configuration verified successfully!",
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

  const handleSaveWhatsAppConfig = () => {
    if (!whatsappConfig.businessPhone || !whatsappConfig.apiToken) {
      toast({
        title: "Missing Information",
        description: "Please provide both business phone number and API token.",
        variant: "destructive",
      });
      return;
    }
    saveConfigMutation.mutate(whatsappConfig);
  };

  const handleVerifyWhatsAppConfig = () => {
    if (!whatsappConfig.businessPhone || !whatsappConfig.apiToken) {
      toast({
        title: "Missing Information",
        description: "Please provide both business phone number and API token.",
        variant: "destructive",
      });
      return;
    }
    verifyConfigMutation.mutate(whatsappConfig);
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

  const isConfigured = whatsappStatus?.enabled && whatsappStatus?.businessPhone && whatsappStatus?.apiToken;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-lg font-medium">WhatsApp Business API Configuration</h3>
        <p className="text-gray-600 text-sm">
          Connect your WhatsApp Business API to send product broadcasts and updates to your customer groups.
        </p>

        {!isConfigured ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-blue-800 font-medium mb-3">
              📱 Setup WhatsApp Business API
            </h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Phone Number
                </label>
                <Input
                  placeholder="e.g., +1234567890"
                  value={whatsappConfig.businessPhone}
                  onChange={(e) => setWhatsappConfig({...whatsappConfig, businessPhone: e.target.value})}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Include country code. This must be your verified WhatsApp Business number.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Access Token
                </label>
                <Input
                  type="password"
                  placeholder="Your Meta WhatsApp Business API token"
                  value={whatsappConfig.apiToken}
                  onChange={(e) => setWhatsappConfig({...whatsappConfig, apiToken: e.target.value})}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get this from your Meta for Developers account under WhatsApp Business API.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Name (Optional)
                </label>
                <Input
                  placeholder="Your business name"
                  value={whatsappConfig.businessName}
                  onChange={(e) => setWhatsappConfig({...whatsappConfig, businessName: e.target.value})}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleVerifyWhatsAppConfig}
                  disabled={verifyConfigMutation.isPending || !whatsappConfig.businessPhone || !whatsappConfig.apiToken}
                  variant="outline"
                >
                  {verifyConfigMutation.isPending ? "Verifying..." : "Verify"}
                </Button>
                <Button
                  onClick={handleSaveWhatsAppConfig}
                  disabled={saveConfigMutation.isPending || !whatsappConfig.businessPhone || !whatsappConfig.apiToken}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {saveConfigMutation.isPending ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-medium">
              ✅ WhatsApp Business API is configured and ready to use!
            </p>
            <p className="text-green-700 text-sm mt-1">
              Business Phone: {whatsappStatus.businessPhone}
            </p>
            <p className="text-green-700 text-sm">
              You can now create broadcasts in the Broadcasts section and send messages to your customer groups.
            </p>
          </div>
        )}
      </div>

      {isConfigured && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Test Integration</h3>
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

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-2">📚 Setup Guide</h4>
        <div className="text-sm text-gray-600 space-y-2">
          <p><strong>Step 1:</strong> Create a Meta for Developers account at <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">developers.facebook.com</a></p>
          <p><strong>Step 2:</strong> Set up WhatsApp Business API in your Meta Business account</p>
          <p><strong>Step 3:</strong> Get your verified business phone number and access token</p>
          <p><strong>Step 4:</strong> Add the credentials above and verify the connection</p>
          <p><strong>Step 5:</strong> Test the integration and start sending broadcasts!</p>
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