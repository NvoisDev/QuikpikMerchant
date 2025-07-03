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
import Sidebar from "@/components/layout/sidebar";
import { currencies } from "@/lib/currencies";
import { User, Settings2, Building2, CreditCard, Bell } from "lucide-react";

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

const notificationFormSchema = z.object({
  email: z.boolean().default(true),
  sms: z.boolean().default(true),
  orderUpdates: z.boolean().default(true),
  stockAlerts: z.boolean().default(true),
  marketingEmails: z.boolean().default(false),
});

type SettingsFormData = z.infer<typeof settingsFormSchema>;
type NotificationFormData = z.infer<typeof notificationFormSchema>;

export default function Settings() {
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
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      
      <div className="flex-1 lg:ml-64 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-2">Manage your account preferences and business settings</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
                  </nav>
                </CardContent>
              </Card>
            </div>

            {/* Settings Form */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Settings2 className="h-6 w-6 mr-2" />
                    {activeTab === "account" && "Account Settings"}
                    {activeTab === "business" && "Business Settings"}
                    {activeTab === "billing" && "Billing & Subscription"}
                    {activeTab === "notifications" && "Notification Settings"}
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

                      {/* Business Information */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium">Business Information</h3>
                        
                        <FormField
                          control={form.control}
                          name="businessName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Name</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Your business name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="businessAddress"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Address</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Your business address" />
                              </FormControl>
                              <FormMessage />
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
                                <Input {...field} placeholder="Your business phone number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="phoneNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Personal Phone (for SMS notifications)</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Your personal phone number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Preferences */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-medium">Preferences</h3>
                        
                        <FormField
                          control={form.control}
                          name="preferredCurrency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Default Currency</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select currency" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {currencies.map((currency) => (
                                    <SelectItem key={currency.code} value={currency.code}>
                                      {currency.symbol} {currency.code} - {currency.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex justify-end">
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
                        <p className="text-gray-600">Manage your subscription and billing information.</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-blue-800">Billing features coming soon. Contact support for subscription changes.</p>
                      </div>
                    </div>
                  )}

                  {activeTab === "notifications" && (
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-medium mb-4">Notification Preferences</h3>
                        <p className="text-gray-600">Control how you receive notifications via text/SMS and email.</p>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-4">
                          <h4 className="font-medium text-gray-900">Notification Methods</h4>
                          
                          <div className="space-y-3">
                            <div className="flex items-center space-x-3">
                              <input 
                                type="checkbox" 
                                id="email-notifications" 
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded" 
                                defaultChecked={user?.notificationPreferences?.email !== false || true}
                              />
                              <label htmlFor="email-notifications" className="text-sm font-medium text-gray-700">
                                Email notifications
                              </label>
                            </div>
                            
                            <div className="flex items-center space-x-3">
                              <input 
                                type="checkbox" 
                                id="sms-notifications" 
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded" 
                                defaultChecked={true}
                              />
                              <label htmlFor="sms-notifications" className="text-sm font-medium text-gray-700">
                                Text/SMS notifications
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="font-medium text-gray-900">Notification Types</h4>
                          
                          <div className="space-y-3">
                            <div className="flex items-center space-x-3">
                              <input 
                                type="checkbox" 
                                id="order-updates" 
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded" 
                                defaultChecked={true}
                              />
                              <label htmlFor="order-updates" className="text-sm font-medium text-gray-700">
                                Order updates and status changes
                              </label>
                            </div>
                            
                            <div className="flex items-center space-x-3">
                              <input 
                                type="checkbox" 
                                id="stock-alerts" 
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded" 
                                defaultChecked={true}
                              />
                              <label htmlFor="stock-alerts" className="text-sm font-medium text-gray-700">
                                Low stock alerts and inventory warnings
                              </label>
                            </div>
                            
                            <div className="flex items-center space-x-3">
                              <input 
                                type="checkbox" 
                                id="marketing-emails" 
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded" 
                                defaultChecked={false}
                              />
                              <label htmlFor="marketing-emails" className="text-sm font-medium text-gray-700">
                                Marketing emails and product updates
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="pt-4 border-t">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-blue-800 text-sm">
                              <strong>Note:</strong> To receive SMS notifications, make sure to add your personal phone number in the Account tab.
                            </p>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button className="min-w-[120px]">
                            Save Preferences
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}