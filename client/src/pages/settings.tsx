import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { User, Settings2, Building2, Bell, Puzzle, ExternalLink, Upload, Image } from "lucide-react";
import Logo from '@/components/ui/logo';
import { SiWhatsapp, SiStripe } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("account");
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [isConnectingWhatsApp, setIsConnectingWhatsApp] = useState(false);
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [isEditingBusiness, setIsEditingBusiness] = useState(false);
  const [accountForm, setAccountForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phoneNumber: user?.phoneNumber || '',
    preferredCurrency: user?.preferredCurrency || 'GBP'
  });
  const [businessForm, setBusinessForm] = useState({
    businessName: user?.businessName || '',
    businessPhone: user?.businessPhone || '',
    businessAddress: user?.businessAddress || '',
    city: user?.city || '',
    postalCode: user?.postalCode || '',
    country: user?.country || 'United Kingdom',
    timezone: user?.timezone || 'UTC',
    logoType: user?.logoType || 'business',
    logoUrl: user?.logoUrl || ''
  });

  // Sync form state with user data when user loads
  useEffect(() => {
    if (user) {
      setAccountForm({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        preferredCurrency: user.preferredCurrency || 'GBP'
      });
      setBusinessForm({
        businessName: user.businessName || '',
        businessPhone: user.businessPhone || '',
        businessAddress: user.businessAddress || '',
        city: user.city || '',
        postalCode: user.postalCode || '',
        country: user.country || 'United Kingdom',
        timezone: user.timezone || 'UTC',
        logoType: user.logoType || 'business',
        logoUrl: user.logoUrl || ''
      });
    }
  }, [user]);

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

  const handleStripeConnect = async () => {
    setIsConnectingStripe(true);
    try {
      const response = await apiRequest('POST', '/api/stripe/connect');
      const data = await response.json();
      
      if (data.url) {
        // Redirect to Stripe Connect onboarding
        window.open(data.url, '_blank');
        toast({
          title: "Stripe Connect",
          description: "Opening Stripe account setup in a new window.",
        });
      }
    } catch (error) {
      console.error('Error connecting to Stripe:', error);
      toast({
        title: "Connection Failed",
        description: "Unable to connect to Stripe. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnectingStripe(false);
    }
  }

  const handleStripeDashboard = async () => {
    setIsConnectingStripe(true);
    try {
      const response = await apiRequest('POST', '/api/stripe/dashboard');
      const data = await response.json();
      
      if (data.url) {
        // Open Stripe dashboard in new window
        window.open(data.url, '_blank');
        toast({
          title: "Stripe Dashboard",
          description: "Opening your Stripe account dashboard in a new window.",
        });
      }
    } catch (error) {
      console.error('Error opening Stripe dashboard:', error);
      toast({
        title: "Dashboard Error",
        description: "Unable to open Stripe dashboard. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnectingStripe(false);
    }
  }

  const handleSaveAccount = async () => {
    try {
      const response = await apiRequest('PUT', '/api/user/profile', accountForm);
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Account Updated",
          description: "Your account information has been saved successfully.",
        });
        setIsEditingAccount(false);
        window.location.reload(); // Refresh to show updated data
      }
    } catch (error) {
      console.error('Error updating account:', error);
      toast({
        title: "Update Failed",
        description: "Unable to update account information. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveBusiness = async () => {
    try {
      const response = await apiRequest('PUT', '/api/user/profile', businessForm);
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Business Updated",
          description: "Your business information has been saved successfully.",
        });
        setIsEditingBusiness(false);
        window.location.reload(); // Refresh to show updated data
      }
    } catch (error) {
      console.error('Error updating business:', error);
      toast({
        title: "Update Failed",
        description: "Unable to update business information. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleWhatsAppConnect = async () => {
    // Show configuration dialog
    const accessToken = prompt(
      "Enter your WhatsApp Business API Access Token\n\n" +
      "You can get this from:\n" +
      "1. Go to Meta Business Manager\n" +
      "2. Navigate to System Users\n" +
      "3. Generate a permanent access token with whatsapp_business_messaging permissions"
    );

    if (!accessToken) return;

    const phoneNumberId = prompt(
      "Enter your WhatsApp Business Phone Number ID\n\n" +
      "You can find this in:\n" +
      "1. Meta Business Manager\n" +
      "2. WhatsApp Manager\n" +
      "3. Phone Numbers section\n" +
      "4. Copy the Phone Number ID (not the actual phone number)"
    );

    if (!phoneNumberId) return;

    const businessName = prompt(
      "Enter your WhatsApp Business Display Name (optional)\n\n" +
      "This will appear in WhatsApp messages to customers"
    );

    const businessPhone = prompt(
      "Enter your WhatsApp Business Phone Number (optional)\n\n" +
      "Format: +44XXXXXXXXXX"
    );

    setIsConnectingWhatsApp(true);
    try {
      const response = await apiRequest('POST', '/api/whatsapp/connect', {
        accessToken,
        phoneNumberId,
        businessName: businessName || undefined,
        businessPhone: businessPhone || undefined
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "WhatsApp Connected",
          description: "WhatsApp Business API configured successfully. You can now send broadcasts to customers.",
        });
        window.location.reload();
      } else {
        throw new Error(data.message || "Configuration failed");
      }
    } catch (error) {
      console.error('Error connecting WhatsApp:', error);
      toast({
        title: "Configuration Failed",
        description: "Unable to configure WhatsApp. Please check your credentials and try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnectingWhatsApp(false);
    }
  };

  const handleWhatsAppConfig = () => {
    toast({
      title: "WhatsApp Configuration",
      description: "WhatsApp setup will be available in the next update. Contact support for early access.",
    });
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
                {/* Account Settings */}
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

                {/* Business Settings */}
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

                {/* Notification Settings */}
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
                
                {/* Integration Settings */}
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
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">Account Information</h3>
                    {!isEditingAccount ? (
                      <button
                        onClick={() => setIsEditingAccount(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="flex space-x-2">
                        <button
                          onClick={handleSaveAccount}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingAccount(false);
                            setAccountForm({
                              firstName: user?.firstName || '',
                              lastName: user?.lastName || '',
                              email: user?.email || '',
                              phoneNumber: user?.phoneNumber || '',
                              preferredCurrency: user?.preferredCurrency || 'GBP'
                            });
                          }}
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    {!isEditingAccount ? (
                      <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Name</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {user.firstName && user.lastName 
                              ? `${user.firstName} ${user.lastName}` 
                              : user.firstName || user.lastName || 'Not set'
                            }
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Email</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.email || 'Not set'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Phone</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.phoneNumber || 'Not set'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Currency</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.preferredCurrency || 'GBP'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Role</dt>
                          <dd className="mt-1 text-sm text-gray-900 capitalize">{user.role || 'Wholesaler'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Subscription</dt>
                          <dd className="mt-1 text-sm text-gray-900 capitalize">{user.subscriptionTier || 'Free'}</dd>
                        </div>
                      </dl>
                    ) : (
                      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div>
                          <label className="text-sm font-medium text-gray-500">First Name</label>
                          <input
                            type="text"
                            value={accountForm.firstName}
                            onChange={(e) => setAccountForm({...accountForm, firstName: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Last Name</label>
                          <input
                            type="text"
                            value={accountForm.lastName}
                            onChange={(e) => setAccountForm({...accountForm, lastName: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Email</label>
                          <input
                            type="email"
                            value={accountForm.email}
                            onChange={(e) => setAccountForm({...accountForm, email: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Phone</label>
                          <input
                            type="tel"
                            value={accountForm.phoneNumber}
                            onChange={(e) => setAccountForm({...accountForm, phoneNumber: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            placeholder="+44XXXXXXXXXX"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Currency</label>
                          <select
                            value={accountForm.preferredCurrency}
                            onChange={(e) => setAccountForm({...accountForm, preferredCurrency: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="GBP">GBP (£)</option>
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "business" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900">Business Information</h3>
                    {!isEditingBusiness ? (
                      <button
                        onClick={() => setIsEditingBusiness(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="flex space-x-2">
                        <button
                          onClick={handleSaveBusiness}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setIsEditingBusiness(false);
                            setBusinessForm({
                              businessName: user?.businessName || '',
                              businessPhone: user?.businessPhone || '',
                              businessAddress: user?.businessAddress || '',
                              city: user?.city || '',
                              postalCode: user?.postalCode || '',
                              country: user?.country || 'United Kingdom',
                              timezone: user?.timezone || 'UTC'
                            });
                          }}
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    {!isEditingBusiness ? (
                      <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Business Name</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.businessName || 'Not set'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Business Phone</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.businessPhone || 'Not set'}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-sm font-medium text-gray-500">Business Address</dt>
                          <dd className="mt-1 text-sm text-gray-900">
                            {user.businessAddress || 'Not set'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">City</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.city || 'Not set'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Postal Code</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.postalCode || 'Not set'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Country</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.country || 'United Kingdom'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm font-medium text-gray-500">Timezone</dt>
                          <dd className="mt-1 text-sm text-gray-900">{user.timezone || 'UTC'}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-sm font-medium text-gray-500">Company Logo / Business Initials</dt>
                          <dd className="mt-1">
                            <div className="flex items-center space-x-4">
                              <Logo size="lg" user={user} />
                              <div className="text-sm text-gray-600">
                                {user.logoType === 'custom' && user.logoUrl ? (
                                  <span>Custom logo uploaded</span>
                                ) : user.logoType === 'business' && user.businessName ? (
                                  <span>Business initials from: {user.businessName}</span>
                                ) : (
                                  <span>Default Quikpik logo</span>
                                )}
                              </div>
                            </div>
                          </dd>
                        </div>
                      </dl>
                    ) : (
                      <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div>
                          <label className="text-sm font-medium text-gray-500">Business Name</label>
                          <input
                            type="text"
                            value={businessForm.businessName}
                            onChange={(e) => setBusinessForm({...businessForm, businessName: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Business Phone</label>
                          <input
                            type="tel"
                            value={businessForm.businessPhone}
                            onChange={(e) => setBusinessForm({...businessForm, businessPhone: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            placeholder="+44XXXXXXXXXX"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-sm font-medium text-gray-500">Business Address</label>
                          <textarea
                            value={businessForm.businessAddress}
                            onChange={(e) => setBusinessForm({...businessForm, businessAddress: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            rows={3}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">City</label>
                          <input
                            type="text"
                            value={businessForm.city}
                            onChange={(e) => setBusinessForm({...businessForm, city: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Postal Code</label>
                          <input
                            type="text"
                            value={businessForm.postalCode}
                            onChange={(e) => setBusinessForm({...businessForm, postalCode: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Country</label>
                          <select
                            value={businessForm.country}
                            onChange={(e) => setBusinessForm({...businessForm, country: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="United Kingdom">United Kingdom</option>
                            <option value="United States">United States</option>
                            <option value="Canada">Canada</option>
                            <option value="Australia">Australia</option>
                            <option value="Ireland">Ireland</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Timezone</label>
                          <select
                            value={businessForm.timezone}
                            onChange={(e) => setBusinessForm({...businessForm, timezone: e.target.value})}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="UTC">UTC</option>
                            <option value="Europe/London">London (GMT/BST)</option>
                            <option value="America/New_York">New York (EST/EDT)</option>
                            <option value="America/Los_Angeles">Los Angeles (PST/PDT)</option>
                            <option value="Australia/Sydney">Sydney (AEST/AEDT)</option>
                          </select>
                        </div>
                        
                        <div className="sm:col-span-2">
                          <label className="text-sm font-medium text-gray-500 mb-4 block">Company Logo / Business Initials</label>
                          <div className="space-y-4">
                            <div className="flex items-center space-x-4">
                              <Logo size="lg" user={{...user, ...businessForm}} />
                              <div className="text-sm text-gray-600">
                                Current display preview
                              </div>
                            </div>
                            
                            <div className="space-y-3">
                              <div>
                                <label className="flex items-center space-x-2">
                                  <input
                                    type="radio"
                                    name="logoType"
                                    value="business"
                                    checked={businessForm.logoType === 'business'}
                                    onChange={(e) => setBusinessForm({...businessForm, logoType: e.target.value})}
                                    className="text-blue-600"
                                  />
                                  <span className="text-sm">Use business initials from business name</span>
                                </label>
                                {businessForm.logoType === 'business' && (
                                  <p className="text-xs text-gray-500 ml-6 mt-1">
                                    Will show: {businessForm.businessName ? 
                                      businessForm.businessName.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase() || 'QP'
                                      : 'QP'
                                    }
                                  </p>
                                )}
                              </div>
                              
                              <div>
                                <label className="flex items-center space-x-2">
                                  <input
                                    type="radio"
                                    name="logoType"
                                    value="custom"
                                    checked={businessForm.logoType === 'custom'}
                                    onChange={(e) => setBusinessForm({...businessForm, logoType: e.target.value})}
                                    className="text-blue-600"
                                  />
                                  <span className="text-sm">Upload custom logo</span>
                                </label>
                                {businessForm.logoType === 'custom' && (
                                  <div className="ml-6 mt-2 space-y-2">
                                    <input
                                      type="url"
                                      placeholder="https://example.com/logo.png"
                                      value={businessForm.logoUrl}
                                      onChange={(e) => setBusinessForm({...businessForm, logoUrl: e.target.value})}
                                      className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                                    />
                                    <p className="text-xs text-gray-500">
                                      Enter the URL of your logo image. Best format: PNG with transparent background, 200x200px or larger.
                                    </p>
                                  </div>
                                )}
                              </div>
                              
                              <div>
                                <label className="flex items-center space-x-2">
                                  <input
                                    type="radio"
                                    name="logoType"
                                    value="default"
                                    checked={businessForm.logoType === 'default'}
                                    onChange={(e) => setBusinessForm({...businessForm, logoType: e.target.value})}
                                    className="text-blue-600"
                                  />
                                  <span className="text-sm">Use default Quikpik logo</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Notification Preferences</h3>
                    <p className="text-gray-600">Manage your notifications and stay updated with important information.</p>
                  </div>
                  
                  {/* General notification settings */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-800 mb-2">General Notification Settings</h4>
                    <p className="text-gray-600">Additional notification preferences coming soon.</p>
                  </div>
                </div>
              )}

              {activeTab === "integrations" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium mb-4">Integration Settings</h3>
                    <p className="text-gray-600">Connect your business with WhatsApp and Stripe to streamline operations.</p>
                  </div>
                  
                  {/* WhatsApp Integration */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <SiWhatsapp className="w-6 h-6 text-green-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-medium text-gray-900 mb-2">WhatsApp Business API</h4>
                        <p className="text-gray-600 mb-4">Connect WhatsApp to send order updates and communicate with customers directly.</p>
                        
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                          <h5 className="font-medium text-blue-900 mb-2">Setup Instructions:</h5>
                          <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
                            <li>Apply for WhatsApp Business API at <a href="https://business.whatsapp.com/products/business-api" target="_blank" rel="noopener noreferrer" className="underline">business.whatsapp.com</a></li>
                            <li>Get approved by Meta and receive your WhatsApp Business Account ID</li>
                            <li>Generate a permanent access token from your Meta Business account</li>
                            <li>Add your phone number and verify it with WhatsApp Business</li>
                            <li>Configure webhook URL in Meta Developer Console: <code className="bg-blue-100 px-1 rounded">https://quikpik.app/api/webhooks/whatsapp</code></li>
                            <li>Set webhook fields: messages, message_deliveries, message_reads</li>
                            <li>Test with a template message to verify the connection</li>
                          </ol>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            Status: {user?.whatsappEnabled ? 'Connected' : 'Not configured'}
                          </span>
                          <button 
                            onClick={handleWhatsAppConnect}
                            disabled={isConnectingWhatsApp}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span>{isConnectingWhatsApp ? 'Connecting...' : (user?.whatsappEnabled ? 'Reconfigure' : 'Configure WhatsApp')}</span>
                            {!isConnectingWhatsApp && <ExternalLink className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stripe Integration */}
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <SiStripe className="w-6 h-6 text-purple-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-medium text-gray-900 mb-2">Stripe Payment Processing</h4>
                        <p className="text-gray-600 mb-4">Accept secure payments and manage subscriptions through Stripe.</p>
                        
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                          <h5 className="font-medium text-purple-900 mb-2">Setup Instructions:</h5>
                          <ol className="list-decimal list-inside text-sm text-purple-800 space-y-1">
                            <li>Click "Connect Stripe" below to start the Stripe Connect onboarding process</li>
                            <li>Complete business verification with Stripe (identity, bank account, business details)</li>
                            <li>Stripe will verify your information (usually takes 1-2 business days)</li>
                            <li>Once approved, you'll receive payments directly to your connected bank account</li>
                            <li>Webhook endpoints are automatically configured: <code className="bg-purple-100 px-1 rounded">https://quikpik.app/api/webhooks/stripe</code></li>
                            <li>Test the integration by processing a sample customer order</li>
                          </ol>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">
                            Status: {user?.stripeAccountId ? 'Connected' : 'Ready to connect'}
                          </span>
                          <button 
                            onClick={user?.stripeAccountId ? handleStripeDashboard : handleStripeConnect}
                            disabled={isConnectingStripe}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span>{isConnectingStripe ? 'Connecting...' : (user?.stripeAccountId ? 'Manage Account' : 'Connect Stripe')}</span>
                            {!isConnectingStripe && <ExternalLink className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Integrations */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-800 mb-2">Additional Integrations</h4>
                    <p className="text-gray-600 text-sm">More integrations like SMS notifications, email marketing, and inventory management will be available soon.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

