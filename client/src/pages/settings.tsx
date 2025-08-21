import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { WhatsAppSetupGuides } from "@/components/WhatsAppSetupGuides";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { User, Settings2, Building2, CreditCard, Bell, MessageSquare, MapPin, Globe, AlertTriangle, HelpCircle, ExternalLink, Puzzle, ArrowLeft } from "lucide-react";
import { ProviderSelection } from "@/components/provider-selection";
import { WhatsAppProviderSelection } from "@/components/WhatsAppProviderSelection";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { whatsappHelpContent } from "@/data/whatsapp-help-content";

import { CustomerProfileNotifications } from "@/components/wholesaler/CustomerProfileNotifications";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("account");

  useEffect(() => {
    const handleUrlParams = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tab = urlParams.get('tab');
      const success = urlParams.get('success');
      const canceled = urlParams.get('canceled');
      
      if (tab) {
        setActiveTab(tab);
      }
      
      // Handle subscription success/cancel messages
      if (success === 'true') {
        toast({
          title: "Subscription Updated!",
          description: "Your subscription has been successfully updated. Thank you for upgrading!",
        });
        // Clear the URL parameter
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('success');
        window.history.replaceState({}, '', newUrl.toString());
        // Refresh subscription data with manual refresh call
        try {
          await apiRequest("POST", "/api/subscription/refresh");
        } catch (error) {
          console.error("Failed to refresh subscription data:", error);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      } else if (canceled === 'true') {
        toast({
          title: "Subscription Canceled",
          description: "Your subscription upgrade was canceled. You can try again anytime.",
          variant: "destructive",
        });
        // Clear the URL parameter
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('canceled');
        window.history.replaceState({}, '', newUrl.toString());
      }
    };
    
    handleUrlParams();
  }, [toast]);

  if (!user) {
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
                    activeTab === "integrations" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("integrations")}
                >
                  <Puzzle className="h-5 w-5 mr-3" />
                  <span>Integrations</span>
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
                {activeTab === "notifications" && "Notification Settings"}
                {activeTab === "integrations" && "Integrations"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeTab === "account" && (
                <div className="space-y-6">
                  <div className="text-center py-8">
                    <User className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-lg font-medium text-gray-900">Account Information</h3>
                    <p className="mt-1 text-gray-500">
                      Personal profile settings are managed in the customer portal.
                    </p>
                    <p className="mt-2 text-sm text-gray-400">
                      Use the customer portal Account Settings to edit your name, email, phone, and business information.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "business" && (
                <div className="space-y-6">
                  <div className="text-center py-8">
                    <Building2 className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-lg font-medium text-gray-900">Business Settings</h3>
                    <p className="mt-1 text-gray-500">
                      Business information is managed through the customer portal.
                    </p>
                    <p className="mt-2 text-sm text-gray-400">
                      Use the customer portal Account Settings to edit business details like name, address, and contact information.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Notification Preferences</h3>
                    <p className="text-gray-600">Manage your notifications and stay updated with important information.</p>
                  </div>
                  
                  {/* Customer Profile Notifications - Only for wholesalers */}
                  {user?.role === 'wholesaler' && (
                    <div className="space-y-4">
                      <CustomerProfileNotifications />
                    </div>
                  )}
                  
                  {/* General notification settings */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-800 mb-2">General Notification Settings</h4>
                    <p className="text-gray-600">Additional notification preferences coming soon.</p>
                  </div>
                </div>
              )}

              {activeTab === "integrations" && (
                <IntegrationsSection />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function IntegrationsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Stripe Connect integration
  const { data: stripeStatus = {}, isLoading: stripeLoading } = useQuery({
    queryKey: ["/api/stripe/connect/status"],
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 30 * 1000, // Consider data fresh for 30 seconds (shorter for setup detection)
  });

  const startOnboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/stripe/connect-onboarding");
      return response.json();
    },
    onSuccess: (data) => {
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

  // WhatsApp integration - full setup state
  const { data: whatsappStatus = {}, isLoading: whatsappLoading } = useQuery({
    queryKey: ["/api/whatsapp/status"],
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });

  const [showWhatsAppSetup, setShowWhatsAppSetup] = useState(false);
  const [showPaymentSetup, setShowPaymentSetup] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'twilio' | 'direct'>('twilio');
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [showProviderSelection, setShowProviderSelection] = useState(false);
  
  // WhatsApp configuration states
  const [twilioConfig, setTwilioConfig] = useState({
    accountSid: "",
    authToken: "",
    phoneNumber: "",
  });
  
  const [directConfig, setDirectConfig] = useState({
    businessPhoneId: "",
    accessToken: "",
    appId: "",
    businessPhone: "",
    businessName: "",
  });

  const [testPhoneNumber, setTestPhoneNumber] = useState("");

  // WhatsApp mutations
  const saveConfigMutation = useMutation({
    mutationFn: async (config: any) => {
      const response = await apiRequest("POST", "/api/whatsapp/config", config);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Configuration Saved",
        description: "WhatsApp integration has been configured successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      setShowWhatsAppSetup(false);
      setIsEditingConfig(false);
    },
    onError: (error: any) => {
      toast({
        title: "Configuration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyConfigMutation = useMutation({
    mutationFn: async ({ phoneNumber }: { phoneNumber: string }) => {
      const response = await apiRequest("POST", "/api/whatsapp/test", { phoneNumber });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Test Message Sent",
        description: "Check your WhatsApp for the test message.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Test Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handler functions
  const handleSaveWhatsAppConfig = () => {
    const config = selectedProvider === 'twilio' 
      ? { provider: 'twilio', ...twilioConfig }
      : { provider: 'direct', ...directConfig };
    
    saveConfigMutation.mutate(config);
  };

  const handleVerifyWhatsAppConfig = () => {
    if (!testPhoneNumber) {
      toast({
        title: "Phone Number Required",
        description: "Please enter a phone number to test with.",
        variant: "destructive",
      });
      return;
    }
    verifyConfigMutation.mutate({ phoneNumber: testPhoneNumber });
  };

  if (stripeLoading || whatsappLoading) {
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
        <h3 className="text-lg font-medium mb-4">Integrations</h3>
        <p className="text-gray-600">Connect your business tools to streamline operations</p>
      </div>

      {!showPaymentSetup && !showWhatsAppSetup ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Payment Processing Integration */}
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowPaymentSetup(true)}>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <CreditCard className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold">Payment Processing</h4>
                      <p className="text-sm text-gray-600">Stripe Connect</p>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs ${
                    stripeStatus?.isActive 
                      ? "bg-green-100 text-green-800" 
                      : "bg-gray-100 text-gray-800"
                  }`}>
                    {stripeStatus?.isActive ? "Connected" : "Not Connected"}
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  {stripeStatus?.isActive 
                    ? "Accept payments and manage transactions securely" 
                    : "Set up secure payment processing for your business"
                  }
                </p>
              </div>
            </CardContent>
          </Card>

          {/* WhatsApp Integration */}
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowWhatsAppSetup(true)}>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-green-100 p-2 rounded-lg">
                      <MessageSquare className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold">WhatsApp Business</h4>
                      <p className="text-sm text-gray-600">Messaging & Marketing</p>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-full text-xs ${
                    whatsappStatus?.isConfigured 
                      ? "bg-green-100 text-green-800" 
                      : "bg-gray-100 text-gray-800"
                  }`}>
                    {whatsappStatus?.isConfigured ? "Connected" : "Not Connected"}
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  {whatsappStatus?.isConfigured 
                    ? "Send messages and manage customer communications" 
                    : "Connect WhatsApp to reach customers directly"
                  }
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Payment Setup */}
      {showPaymentSetup && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <CreditCard className="h-6 w-6 mr-2" />
                Payment Processing Setup
              </CardTitle>
              <Button 
                variant="ghost" 
                onClick={() => setShowPaymentSetup(false)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {stripeStatus?.isActive ? (
              <div className="text-center py-8">
                <div className="bg-green-100 rounded-full p-3 w-16 h-16 mx-auto mb-4">
                  <CreditCard className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Payment Processing Active</h3>
                <p className="text-gray-600 mb-4">Your Stripe Connect account is set up and ready to accept payments.</p>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-2">
                    <ExternalLink className="h-4 w-4 text-green-600 mt-1" />
                    <div className="text-left">
                      <p className="text-sm text-green-800 font-medium">Manage Your Stripe Account</p>
                      <p className="text-sm text-green-700 mt-1">
                        Visit your Stripe dashboard to view transactions, update settings, and manage payouts.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="bg-blue-100 rounded-full p-3 w-16 h-16 mx-auto mb-4">
                  <CreditCard className="h-10 w-10 text-blue-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Set Up Payment Processing</h3>
                <p className="text-gray-600 mb-6">Connect your Stripe account to start accepting payments from customers.</p>
                
                <Button 
                  onClick={() => startOnboardingMutation.mutate()}
                  disabled={startOnboardingMutation.isPending}
                  className="mb-4"
                >
                  {startOnboardingMutation.isPending ? "Connecting..." : "Connect Stripe Account"}
                </Button>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-blue-600 mt-1" />
                    <div className="text-left">
                      <p className="text-sm text-blue-800 font-medium">What happens next?</p>
                      <p className="text-sm text-blue-700 mt-1">
                        You'll be redirected to Stripe to complete your account setup. This is required to accept payments from customers.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* WhatsApp Setup */}
      {showWhatsAppSetup && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                <MessageSquare className="h-6 w-6 mr-2" />
                WhatsApp Business Setup
                <ContextualHelpBubble 
                  content={whatsappHelpContent.setup} 
                  className="ml-2"
                />
              </CardTitle>
              <Button 
                variant="ghost" 
                onClick={() => setShowWhatsAppSetup(false)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {whatsappStatus?.isConfigured && !isEditingConfig ? (
              <div className="text-center py-8">
                <div className="bg-green-100 rounded-full p-3 w-16 h-16 mx-auto mb-4">
                  <MessageSquare className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">WhatsApp Connected</h3>
                <p className="text-gray-600 mb-4">Your WhatsApp Business integration is active and ready to use.</p>
                
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="h-4 w-4 text-green-600 mt-1" />
                      <div className="text-left">
                        <p className="text-sm text-green-800 font-medium">Provider: {whatsappStatus.provider}</p>
                        <p className="text-sm text-green-700 mt-1">
                          Phone: {whatsappStatus.phoneNumber || whatsappStatus.businessPhone || 'Not specified'}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 justify-center">
                    <Button 
                      variant="outline"
                      onClick={() => setIsEditingConfig(true)}
                    >
                      Update Configuration
                    </Button>
                  </div>
                  
                  {/* Test message section */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Test Your Connection</h4>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter phone number (e.g., +1234567890)"
                        value={testPhoneNumber}
                        onChange={(e) => setTestPhoneNumber(e.target.value)}
                        className="flex-1"
                      />
                      <Button 
                        onClick={handleVerifyWhatsAppConfig}
                        disabled={verifyConfigMutation.isPending || !testPhoneNumber}
                      >
                        {verifyConfigMutation.isPending ? "Sending..." : "Send Test"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {!showProviderSelection ? (
                  <div className="text-center py-8">
                    <div className="bg-green-100 rounded-full p-3 w-16 h-16 mx-auto mb-4">
                      <MessageSquare className="h-10 w-10 text-green-600" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {isEditingConfig ? "Update WhatsApp Configuration" : "Connect WhatsApp Business"}
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Choose your WhatsApp Business integration method to start messaging customers.
                    </p>
                    
                    <Button 
                      onClick={() => setShowProviderSelection(true)}
                      className="mb-4"
                    >
                      {isEditingConfig ? "Update Provider" : "Choose Integration Method"}
                    </Button>
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <HelpCircle className="h-4 w-4 text-blue-600 mt-1" />
                        <div className="text-left">
                          <p className="text-sm text-blue-800 font-medium">Need help choosing?</p>
                          <p className="text-sm text-blue-700 mt-1">
                            We support both Twilio (easier setup) and Direct WhatsApp Business API (more features). 
                            We'll guide you through the setup process.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <WhatsAppProviderSelection 
                      selectedProvider={selectedProvider}
                      onProviderChange={setSelectedProvider}
                      onBack={() => setShowProviderSelection(false)}
                    />
                    
                    <div className="mt-6">
                      {selectedProvider === 'twilio' ? (
                        <ProviderSelection
                          provider="twilio"
                          config={twilioConfig}
                          onConfigChange={setTwilioConfig}
                          onSave={handleSaveWhatsAppConfig}
                          onTest={handleVerifyWhatsAppConfig}
                          testPhoneNumber={testPhoneNumber}
                          onTestPhoneNumberChange={setTestPhoneNumber}
                          isLoading={saveConfigMutation.isPending}
                          isTestLoading={verifyConfigMutation.isPending}
                        />
                      ) : (
                        <ProviderSelection
                          provider="direct"
                          config={directConfig}
                          onConfigChange={setDirectConfig}
                          onSave={handleSaveWhatsAppConfig}
                          onTest={handleVerifyWhatsAppConfig}
                          testPhoneNumber={testPhoneNumber}
                          onTestPhoneNumberChange={setTestPhoneNumber}
                          isLoading={saveConfigMutation.isPending}
                          isTestLoading={verifyConfigMutation.isPending}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Setup Guides */}
      {(showWhatsAppSetup || showPaymentSetup) && (
        <WhatsAppSetupGuides />
      )}
    </div>
  );
}