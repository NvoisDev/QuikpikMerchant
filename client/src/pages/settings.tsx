import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { User, Settings2, Building2, Bell, Puzzle, ExternalLink, Upload, Image, CheckCircle, AlertCircle, Clock, MessageSquare, AlertTriangle, Loader2 } from "lucide-react";
import Logo from '@/components/ui/logo';
import { LogoUploader } from '@/components/LogoUploader';
import { SiWhatsapp, SiStripe } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { WhatsAppSetupModal } from "@/components/WhatsAppSetupModal";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("account");
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [isConnectingWhatsApp, setIsConnectingWhatsApp] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  // Get Stripe Connect status
  const { data: stripeStatus, refetch: refetchStripeStatus } = useQuery<{
    isConnected: boolean;
    accountId?: string;
    hasPayoutsEnabled?: boolean;
    requiresInfo?: boolean;
    accountStatus?: 'not_connected' | 'incomplete_setup' | 'pending_verification' | 'active' | 'error';
  }>({
    queryKey: ["/api/stripe/connect/status"],
    retry: false,
    refetchOnWindowFocus: false,
  });
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
          description: "Opening Stripe account setup in a new window. Complete all steps to start accepting payments.",
        });
        
        // Refresh status when user returns (after a delay)
        setTimeout(() => {
          refetchStripeStatus();
        }, 3000);
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
      console.log('🔗 Requesting Stripe dashboard...');
      const response = await apiRequest('POST', '/api/stripe/dashboard');
      console.log('📊 Dashboard response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Dashboard API error:', errorData);
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📄 Dashboard response data:', data);
      
      if (data.url) {
        console.log('🚀 Opening dashboard URL:', data.url);
        // Open Stripe dashboard in new window
        const newWindow = window.open(data.url, '_blank');
        if (!newWindow) {
          throw new Error("Pop-up blocked. Please allow pop-ups for this site.");
        }
        
        toast({
          title: "Stripe Dashboard",
          description: "Opening your Stripe account dashboard in a new window.",
        });
        
        // Refresh status when user returns
        setTimeout(() => {
          refetchStripeStatus();
        }, 2000);
      } else {
        console.error('❌ No URL in response:', data);
        throw new Error("Dashboard URL not provided");
      }
    } catch (error: any) {
      console.error('❌ Error opening Stripe dashboard:', error);
      toast({
        title: "Dashboard Error",
        description: error.message || "Unable to open Stripe dashboard. Please try again.",
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

  // WhatsApp Business API configuration
  const handleWhatsAppConnect = () => {
    setShowWhatsAppModal(true);
  };

  const handleWhatsAppSubmit = async (credentials: {
    accessToken: string;
    businessPhoneId: string;
    businessName?: string;
  }) => {
    setIsConnectingWhatsApp(true);
    try {
      const response = await apiRequest('POST', '/api/whatsapp/configure', {
        accessToken: credentials.accessToken,
        businessPhoneId: credentials.businessPhoneId,
        businessName: credentials.businessName || undefined
      });
      
      const data = await response.json();
      
      if (data.success) {
        await refetchWhatsApp(); // Refresh WhatsApp status
        setShowWhatsAppModal(false);
        toast({
          title: "WhatsApp Connected!",
          description: "Your WhatsApp Business API is now configured and ready to send messages.",
        });
      } else {
        throw new Error(data.message || "Configuration failed");
      }
    } catch (error) {
      console.error('Error configuring WhatsApp:', error);
      toast({
        title: "Configuration Failed",
        description: "Unable to configure WhatsApp Business API. Please verify your credentials and try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnectingWhatsApp(false);
    }
  };

  // Query WhatsApp status
  const { data: whatsappStatus, refetch: refetchWhatsApp } = useQuery({
    queryKey: ["/api/whatsapp/status"],
    staleTime: 30 * 1000, // 30 seconds
  });

  const handleWhatsAppActivation = async () => {
    try {
      setIsConnectingWhatsApp(true);
      
      // Check if user already has WhatsApp activated
      if ((whatsappStatus as any)?.userActivated) {
        toast({
          title: "WhatsApp Already Active",
          description: "Your WhatsApp messaging is already active and ready to use for campaigns.",
        });
        return;
      }
      
      // Check if platform capability is available
      if (!(whatsappStatus as any)?.platformCapable) {
        toast({
          title: "WhatsApp Not Available",
          description: "WhatsApp platform capability is not currently available. Please contact support.",
          variant: "destructive",
        });
        return;
      }
      
      // For new users, activate platform integration (Twilio)
      const response = await apiRequest('POST', '/api/whatsapp/activate', {
        provider: 'platform' // Use platform Twilio integration
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await refetchWhatsApp(); // Refresh WhatsApp status
          toast({
            title: "WhatsApp Activated!",
            description: "Your WhatsApp messaging is now active. You can start sending campaigns to customers.",
          });
        } else {
          throw new Error(result.message || 'Failed to activate WhatsApp');
        }
      } else {
        throw new Error('Network error during activation');
      }
    } catch (error: any) {
      console.error('Error activating WhatsApp:', error);
      toast({
        title: "Activation Failed",
        description: error.message || "Unable to activate WhatsApp. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnectingWhatsApp(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Manage your account preferences and business settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Settings Navigation */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-3 sm:p-6">
              <nav className="space-y-2">
                {/* Account Settings */}
                <div 
                  className={`flex items-center p-2 sm:p-3 rounded-lg cursor-pointer ${
                    activeTab === "account" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("account")}
                >
                  <User className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
                  <span className="font-medium text-sm sm:text-base">Account</span>
                </div>

                {/* Business Settings */}
                <div 
                  className={`flex items-center p-2 sm:p-3 rounded-lg cursor-pointer ${
                    activeTab === "business" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("business")}
                >
                  <Building2 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
                  <span className="text-sm sm:text-base">Business</span>
                </div>

                {/* Notification Settings */}
                <div 
                  className={`flex items-center p-2 sm:p-3 rounded-lg cursor-pointer ${
                    activeTab === "notifications" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("notifications")}
                >
                  <Bell className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
                  <span className="text-sm sm:text-base">Notifications</span>
                </div>
                
                {/* Integration Settings */}
                <div 
                  className={`flex items-center p-2 sm:p-3 rounded-lg cursor-pointer ${
                    activeTab === "integrations" 
                      ? "bg-blue-50 text-blue-700" 
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                  onClick={() => setActiveTab("integrations")}
                >
                  <Puzzle className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
                  <span className="text-sm sm:text-base">Integrations</span>
                </div>

              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Settings Form */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg sm:text-xl">
                <Settings2 className="h-5 w-5 sm:h-6 sm:w-6 mr-2" />
                <span className="text-base sm:text-xl">
                  {activeTab === "account" && "Account Settings"}
                  {activeTab === "business" && "Business Settings"}
                  {activeTab === "notifications" && "Notification Settings"}
                  {activeTab === "integrations" && "Integrations"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
              {activeTab === "account" && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                    <h3 className="text-base sm:text-lg font-medium text-gray-900">Account Information</h3>
                    {!isEditingAccount ? (
                      <button
                        onClick={() => setIsEditingAccount(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                        <button
                          onClick={handleSaveAccount}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
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
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
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
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                    <h3 className="text-base sm:text-lg font-medium text-gray-900">Business Information</h3>
                    {!isEditingBusiness ? (
                      <button
                        onClick={() => setIsEditingBusiness(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                        <button
                          onClick={handleSaveBusiness}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
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
                              timezone: user?.timezone || 'UTC',
                              logoType: user?.logoType || 'business',
                              logoUrl: user?.logoUrl || ''
                            });
                          }}
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors w-full sm:w-auto text-sm sm:text-base"
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
                                  <div className="ml-6 mt-2 space-y-4">
                                    <LogoUploader 
                                      onUploadComplete={(logoUrl) => setBusinessForm({...businessForm, logoUrl})}
                                      currentLogoUrl={businessForm.logoUrl}
                                    />
                                    <div className="space-y-2">
                                      <label className="text-xs font-medium text-gray-600">Or enter logo URL manually:</label>
                                      <input
                                        type="url"
                                        placeholder="https://example.com/logo.png"
                                        value={businessForm.logoUrl}
                                        onChange={(e) => setBusinessForm({...businessForm, logoUrl: e.target.value})}
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-sm"
                                      />
                                    </div>
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
                    <h3 className="text-base sm:text-lg font-medium mb-4">Notification Preferences</h3>
                    <p className="text-gray-600 text-sm sm:text-base">Manage your notifications and stay updated with important information.</p>
                  </div>
                  
                  {/* General notification settings */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                    <h4 className="font-medium text-gray-800 mb-2 text-sm sm:text-base">General Notification Settings</h4>
                    <p className="text-gray-600 text-sm sm:text-base">Additional notification preferences coming soon.</p>
                  </div>
                </div>
              )}

              {activeTab === "integrations" && (
                <div className="space-y-6">
                  {/* WhatsApp Setup Modal */}
                  <WhatsAppSetupModal 
                    isOpen={showWhatsAppModal}
                    onClose={() => setShowWhatsAppModal(false)}
                    onSubmit={handleWhatsAppSubmit}
                    isSubmitting={isConnectingWhatsApp}
                  />

                  <div>
                    <h3 className="text-base sm:text-lg font-medium mb-4">Integration Settings</h3>
                    <p className="text-gray-600 text-sm sm:text-base">Connect your business with WhatsApp and Stripe to streamline operations.</p>
                  </div>
                  
                  {/* WhatsApp Integration - New User Friendly Version */}
                  <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start space-y-4 sm:space-y-0 sm:space-x-4">
                      <div className="flex-shrink-0 self-center sm:self-start">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-100 rounded-lg flex items-center justify-center">
                          <SiWhatsapp className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="text-base sm:text-lg font-medium text-gray-900">WhatsApp Messaging</h4>
                          {(whatsappStatus as any)?.isConfigured ? (
                            <div className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded-full">
                              <CheckCircle className="h-3 w-3" />
                              <span className="text-xs font-medium">Connected</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-full">
                              <MessageSquare className="h-3 w-3" />
                              <span className="text-xs font-medium">Setup Required</span>
                            </div>
                          )}
                        </div>
                        
                        <p className="text-gray-600 mb-4 text-sm sm:text-base">
                          Send product promotions, order confirmations, and customer communications via WhatsApp.
                        </p>
                        
                        {(whatsappStatus as any)?.isConfigured ? (
                          // User has configured WhatsApp Business API - show success state
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 mb-4">
                            <div className="flex items-start gap-3">
                              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                              <div className="flex-1">
                                <h5 className="font-medium text-green-900 mb-1">WhatsApp Business API Connected!</h5>
                                <p className="text-green-800 text-sm mb-2">
                                  Your WhatsApp Business API is configured and ready to send messages. 
                                  You can now:
                                </p>
                                <ul className="text-green-800 text-sm space-y-1">
                                  <li>• Send product campaigns to customer groups</li>
                                  <li>• Notify customers about order updates</li>
                                  <li>• Share promotional offers directly</li>
                                </ul>
                                <div className="mt-3 text-xs text-green-700 bg-green-100 p-2 rounded">
                                  <p><strong>Phone Number ID:</strong> {(whatsappStatus as any)?.phoneNumberId}</p>
                                  {(whatsappStatus as any)?.businessName && (
                                    <p><strong>Business Name:</strong> {(whatsappStatus as any)?.businessName}</p>
                                  )}
                                  <p><strong>Access Token:</strong> {(whatsappStatus as any)?.accessToken}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          // Not configured - show simple setup options
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4">
                            <div className="flex items-start gap-3">
                              <MessageSquare className="h-5 w-5 text-blue-600 mt-0.5" />
                              <div className="flex-1">
                                <h5 className="font-medium text-blue-900 mb-2">Quick Setup Available</h5>
                                <div className="bg-white border border-blue-200 rounded p-3 mb-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    <span className="font-medium text-blue-900 text-sm">Platform Integration (Recommended)</span>
                                    <Badge variant="outline" className="text-green-700 border-green-200 text-xs">Click to Activate</Badge>
                                  </div>
                                  <p className="text-blue-800 text-sm mb-2">
                                    ⚡ WhatsApp messaging capability is available - just needs activation for your account.
                                  </p>
                                  <p className="text-blue-700 text-xs">
                                    One-click setup • Uses our managed WhatsApp service • No external accounts needed
                                  </p>
                                </div>
                                
                                <div className="bg-white border border-blue-200 rounded p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                    <span className="font-medium text-blue-900 text-sm">Custom WhatsApp Business API</span>
                                    <Badge variant="outline" className="text-orange-700 border-orange-200 text-xs">Advanced</Badge>
                                  </div>
                                  <p className="text-blue-800 text-sm mb-1">
                                    Use your own WhatsApp Business API account (requires Meta approval process)
                                  </p>
                                  <p className="text-blue-700 text-xs">
                                    For businesses with specific compliance or branding requirements
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">Status:</span>
                            {(whatsappStatus as any)?.isConfigured ? (
                              <span className="text-green-600 font-medium text-sm">
                                ✅ Connected via WhatsApp Business API
                              </span>
                            ) : (
                              <span className="text-blue-600 font-medium text-sm">
                                ⚡ Ready to configure your WhatsApp Business API
                              </span>
                            )}
                          </div>
                          <button 
                            onClick={handleWhatsAppConnect}
                            disabled={isConnectingWhatsApp}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="text-sm sm:text-base">
                              {(whatsappStatus as any)?.isConfigured ? 'Reconfigure WhatsApp' : 'Connect WhatsApp Business API'}
                            </span>
                            <MessageSquare className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stripe Integration */}
                  <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start space-y-4 sm:space-y-0 sm:space-x-4">
                      <div className="flex-shrink-0 self-center sm:self-start">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                          <SiStripe className="w-4 h-4 sm:w-6 sm:h-6 text-purple-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base sm:text-lg font-medium text-gray-900 mb-2">Stripe Payment Processing</h4>
                        <p className="text-gray-600 mb-4 text-sm sm:text-base">Accept secure payments and manage subscriptions through Stripe.</p>
                        
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 sm:p-4 mb-4">
                          <h5 className="font-medium text-purple-900 mb-2 text-sm sm:text-base">Setup Instructions:</h5>
                          <ol className="list-decimal list-inside text-xs sm:text-sm text-purple-800 space-y-1">
                            <li>Click "Connect Stripe" below to start the Stripe Connect onboarding process</li>
                            <li>Complete business verification with Stripe (identity, bank account, business details)</li>
                            <li>Stripe will verify your information (usually takes 1-2 business days)</li>
                            <li>Once approved, you'll receive payments directly to your connected bank account</li>
                            <li>Webhook endpoints are automatically configured: <code className="bg-purple-100 px-1 rounded text-xs break-all">https://quikpik.app/api/webhooks/stripe</code></li>
                            <li>Test the integration by processing a sample customer order</li>
                          </ol>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                          <div className="flex items-center space-x-2">
                            {stripeStatus?.accountStatus === 'active' && (
                              <>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="text-sm text-green-700 font-medium">Connected</span>
                              </>
                            )}
                            {stripeStatus?.accountStatus === 'incomplete_setup' && (
                              <>
                                <AlertCircle className="h-4 w-4 text-orange-500" />
                                <span className="text-sm text-orange-700 font-medium">Setup Required</span>
                              </>
                            )}
                            {stripeStatus?.accountStatus === 'pending_verification' && (
                              <>
                                <Clock className="h-4 w-4 text-blue-500" />
                                <span className="text-sm text-blue-700 font-medium">Pending Verification</span>
                              </>
                            )}
                            {(!stripeStatus?.accountStatus || stripeStatus?.accountStatus === 'not_connected') && (
                              <>
                                <AlertCircle className="h-4 w-4 text-gray-500" />
                                <span className="text-sm text-gray-600">Ready to connect</span>
                              </>
                            )}
                            {stripeStatus?.accountStatus === 'error' && (
                              <>
                                <AlertCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm text-red-700 font-medium">Setup Error</span>
                              </>
                            )}
                          </div>
                          <button 
                            onClick={() => {
                              // For incomplete setup or new connections, always use Connect flow
                              if (stripeStatus?.accountStatus === 'active') {
                                handleStripeDashboard();
                              } else {
                                handleStripeConnect();
                              }
                            }}
                            disabled={isConnectingStripe}
                            className={`px-4 py-2 rounded-lg transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto ${
                              stripeStatus?.accountStatus === 'active' 
                                ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                                : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                          >
                            <span className="text-sm sm:text-base">
                              {isConnectingStripe ? 'Connecting...' : 
                               stripeStatus?.accountStatus === 'active' ? 'Manage Account' :
                               stripeStatus?.accountStatus === 'incomplete_setup' ? 'Complete Setup' :
                               stripeStatus?.accountStatus === 'pending_verification' ? 'View Status' :
                               'Connect Stripe'}
                            </span>
                            {!isConnectingStripe && <ExternalLink className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Additional Integrations */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
                    <h4 className="font-medium text-gray-800 mb-2 text-sm sm:text-base">Additional Integrations</h4>
                    <p className="text-gray-600 text-xs sm:text-sm">More integrations like SMS notifications, email marketing, and inventory management will be available soon.</p>
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

