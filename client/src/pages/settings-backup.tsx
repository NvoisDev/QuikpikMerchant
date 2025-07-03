import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { currencies } from "@/lib/currencies";
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
  logoType: z.enum(["initials", "business_name", "uploaded"]).default("initials"),
  logoUrl: z.string().optional(),
});

const notificationFormSchema = z.object({
  email: z.boolean().default(true),
  sms: z.boolean().default(true),
  orderUpdates: z.boolean().default(true),
  stockAlerts: z.boolean().default(true),
  marketingEmails: z.boolean().default(false),
});

type SettingsFormData = z.infer<typeof settingsFormSchema>;
type NotificationFormData = z.infer<typeof notificationFormSchema>;

const whatsappFormSchema = z.object({
  twilioAccountSid: z.string().min(1, "Twilio Account SID is required"),
  twilioAuthToken: z.string().min(1, "Twilio Auth Token is required"),
  twilioPhoneNumber: z.string().min(1, "Twilio Phone Number is required"),
});

type WhatsAppFormData = z.infer<typeof whatsappFormSchema>;

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

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>, onChange: (value: string) => void) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please choose an image smaller than 2MB.",
        variant: "destructive",
      });
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please choose an image file.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      onChange(result);
    };
    reader.readAsDataURL(file);
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
                    <span>Billing</span>
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
                      {/* Personal Information */}
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

                      {/* Save Button */}
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
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-medium mb-4">Billing & Subscription</h3>
                      <p className="text-gray-600">Manage your billing information and subscription.</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <p className="text-blue-800">Billing management coming soon. Contact support for subscription changes.</p>
                    </div>
                  </div>
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
  const [isEnabled, setIsEnabled] = useState(false);
  const [whatsappConfig, setWhatsappConfig] = useState({
    businessPhone: "",
    apiToken: "",
    businessName: ""
  });

  // Fetch WhatsApp status
  const { data: whatsappStatus, isLoading } = useQuery({
    queryKey: ["/api/whatsapp/status"],
  });

  // Enable WhatsApp mutation
  const enableMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/whatsapp/enable", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      setIsEnabled(true);
      toast({
        title: "WhatsApp Integration Enabled",
        description: "Your WhatsApp integration is now active!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Enable Failed",
        description: error.message,
        variant: "destructive",
      });
    }
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

  const handleEnable = () => {
    enableMutation.mutate();
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

  return (
    <div className="space-y-6">
      {/* Enable/Status Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium">WhatsApp Integration Status</h3>
        {!whatsappStatus?.enabled ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800 font-medium mb-2">
              🚀 Enable WhatsApp Integration
            </p>
            <p className="text-blue-700 text-sm mb-4">
              This will allow you to send product broadcasts and updates to your customer groups.
            </p>
            <Button
              onClick={handleEnable}
              disabled={enableMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {enableMutation.isPending ? "Enabling..." : "Enable WhatsApp Integration"}
            </Button>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-medium">
              ✅ WhatsApp integration is active and ready to use!
            </p>
            <p className="text-green-700 text-sm mt-1">
              You can now create broadcasts in the Broadcasts section and send messages to your customer groups.
            </p>
          </div>
        )}
      </div>

      {/* Test Section */}
      {whatsappStatus?.enabled && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Test Integration</h3>
          <p className="text-gray-600 text-sm">
            Send a test message to verify your WhatsApp integration is working correctly.
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
            Note: Test messages will be sent from our shared business account.
          </p>
        </div>
      )}
    </div>
  );
}

export default Settings;