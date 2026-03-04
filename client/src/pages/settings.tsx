import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { User, Settings2, Building2, Bell, Puzzle, ExternalLink, Upload, Image, CheckCircle, AlertCircle, Clock, MessageSquare, AlertTriangle, Loader2, CreditCard, ChevronRight, ArrowLeft } from "lucide-react";
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
  const [location] = useLocation();
  
  // Get tab from URL parameter or default to "account"
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const tabFromUrl = urlParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || "account");
  
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [isConnectingWhatsApp, setIsConnectingWhatsApp] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  // Integration marketplace navigation
  const [integrationView, setIntegrationView] = useState<'categories' | 'list' | 'detail'>('categories');
  const [selectedCategory, setSelectedCategory] = useState<'communication' | 'payment' | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState<'whatsapp' | 'stripe' | 'paystack' | null>(null);

  // Update active tab when URL changes
  useEffect(() => {
    const urlParams = new URLSearchParams(location.split('?')[1] || '');
    const tabFromUrl = urlParams.get('tab');
    if (tabFromUrl && ['account', 'notifications', 'integrations'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [location]);

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
      console.log('🔗 Starting Stripe Connect process...');
      
      // Directly attempt Stripe Connect without pre-test
      let response = await apiRequest('POST', '/api/stripe/connect');
      let data = await response.json();
      
      // If authentication failed, try refreshing and retry once
      if (response.status === 401 && (data.retry || data.needsRefresh)) {
        console.log('Authentication failed, refreshing page...');
        toast({
          title: "Session Refresh",
          description: "Refreshing your session. Please try again in a moment.",
        });
        
        // Wait a moment then refresh
        setTimeout(() => {
          window.location.reload();
        }, 1500);
        return;
      }
      
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
    <div className="bg-white min-h-screen">
      <PageHeader title="Settings" description="Manage your account preferences and business settings" />
      <div className="space-y-8 p-4 sm:p-6">

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
                                      businessForm.businessName.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase()
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
                                      <div className="text-xs text-gray-500">
                                        💡 Upload your image to any free image hosting service (like Imgur, PostImages, etc.) and paste the direct link here
                                      </div>
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
                  
                  {/* Payment Terms Section */}
                  <div className="mt-8 pt-6 border-t border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 mb-4">
                      <div>
                        <h3 className="text-base sm:text-lg font-medium text-gray-900">Payment Terms</h3>
                        <p className="text-sm text-gray-500 mt-1">Set default payment options for your customers</p>
                      </div>
                    </div>
                    
                    <PaymentTermsSettings user={user} />
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
                  {/* WhatsApp Setup Modal — always mounted */}
                  <WhatsAppSetupModal 
                    isOpen={showWhatsAppModal}
                    onClose={() => setShowWhatsAppModal(false)}
                    onSubmit={handleWhatsAppSubmit}
                    isSubmitting={isConnectingWhatsApp}
                  />

                  {/* ── VIEW: CATEGORIES ─────────────────────────────────── */}
                  {integrationView === 'categories' && (
                    <div>
                      <div className="mb-6">
                        <h3 className="text-base sm:text-lg font-medium mb-1">Integrations</h3>
                        <p className="text-gray-500 text-sm">Connect your business tools to streamline operations.</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button
                          onClick={() => { setSelectedCategory('communication'); setIntegrationView('list'); }}
                          className="text-left border border-gray-200 rounded-xl p-5 hover:border-green-400 hover:shadow-md transition-all group bg-white"
                        >
                          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
                            <SiWhatsapp className="w-6 h-6 text-green-600" />
                          </div>
                          <h4 className="font-semibold text-gray-900 mb-1">Communication</h4>
                          <p className="text-sm text-gray-500">WhatsApp messaging and notifications</p>
                          <div className="mt-3 flex items-center text-green-600 text-sm font-medium">
                            <span>1 integration</span>
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </div>
                        </button>
                        <button
                          onClick={() => { setSelectedCategory('payment'); setIntegrationView('list'); }}
                          className="text-left border border-gray-200 rounded-xl p-5 hover:border-purple-400 hover:shadow-md transition-all group bg-white"
                        >
                          <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors">
                            <CreditCard className="w-6 h-6 text-purple-600" />
                          </div>
                          <h4 className="font-semibold text-gray-900 mb-1">Payments</h4>
                          <p className="text-sm text-gray-500">Stripe · Paystack payment processing</p>
                          <div className="mt-3 flex items-center text-purple-600 text-sm font-medium">
                            <span>2 integrations</span>
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── VIEW: LIST ───────────────────────────────────────── */}
                  {integrationView === 'list' && (
                    <div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
                        <button onClick={() => { setIntegrationView('categories'); setSelectedCategory(null); }} className="hover:text-gray-800 transition-colors">Integrations</button>
                        <ChevronRight className="h-3.5 w-3.5" />
                        <span className="text-gray-900 font-medium">{selectedCategory === 'communication' ? 'Communication' : 'Payments'}</span>
                      </div>

                      {selectedCategory === 'communication' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          <button
                            onClick={() => { setSelectedIntegration('whatsapp'); setIntegrationView('detail'); }}
                            className="text-left border border-gray-200 rounded-xl overflow-hidden hover:shadow-md hover:border-green-300 transition-all bg-white"
                          >
                            <div className="bg-[#25D366] h-28 flex items-center justify-center">
                              <SiWhatsapp className="w-12 h-12 text-white" />
                            </div>
                            <div className="p-4">
                              <div className="flex items-start justify-between mb-2">
                                <span className="font-semibold text-gray-900 text-sm">WhatsApp Messaging</span>
                                {(whatsappStatus as any)?.isConfigured ? (
                                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium shrink-0">
                                    <CheckCircle className="h-2.5 w-2.5" /> Connected
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-medium shrink-0">
                                    <AlertCircle className="h-2.5 w-2.5" /> Setup Required
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">Send campaigns, order updates and promotions via WhatsApp.</p>
                              <p className="text-xs text-gray-400 mt-2">Communication · Marketing</p>
                            </div>
                          </button>
                        </div>
                      )}

                      {selectedCategory === 'payment' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          <button
                            onClick={() => { setSelectedIntegration('stripe'); setIntegrationView('detail'); }}
                            className="text-left border border-gray-200 rounded-xl overflow-hidden hover:shadow-md hover:border-purple-300 transition-all bg-white"
                          >
                            <div className="bg-[#6772E5] h-28 flex items-center justify-center">
                              <SiStripe className="w-14 h-14 text-white" />
                            </div>
                            <div className="p-4">
                              <div className="flex items-start justify-between mb-2">
                                <span className="font-semibold text-gray-900 text-sm">Stripe</span>
                                {stripeStatus?.accountStatus === 'active' ? (
                                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium shrink-0"><CheckCircle className="h-2.5 w-2.5" /> Connected</span>
                                ) : stripeStatus?.accountStatus === 'incomplete_setup' ? (
                                  <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-medium shrink-0"><AlertCircle className="h-2.5 w-2.5" /> Setup Required</span>
                                ) : stripeStatus?.accountStatus === 'pending_verification' ? (
                                  <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium shrink-0"><Clock className="h-2.5 w-2.5" /> Pending</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium shrink-0">Not connected</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500">Accept card payments and route funds directly to your bank account.</p>
                              <p className="text-xs text-gray-400 mt-2">Payments · UK & Europe</p>
                            </div>
                          </button>

                          <div className="text-left border border-gray-200 rounded-xl overflow-hidden bg-white opacity-75">
                            <div className="bg-[#00C3A5] h-28 flex items-center justify-center">
                              <span className="text-white font-bold text-2xl tracking-tight">Paystack</span>
                            </div>
                            <div className="p-4">
                              <div className="flex items-start justify-between mb-2">
                                <span className="font-semibold text-gray-900 text-sm">Paystack</span>
                                <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs font-medium shrink-0">Coming Soon</span>
                              </div>
                              <p className="text-xs text-gray-500">Accept payments from customers across Africa — Nigeria, Ghana and more.</p>
                              <p className="text-xs text-gray-400 mt-2">Payments · Africa</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── VIEW: DETAIL ─────────────────────────────────────── */}
                  {integrationView === 'detail' && (
                    <div>
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
                        <button onClick={() => { setIntegrationView('categories'); setSelectedCategory(null); setSelectedIntegration(null); }} className="hover:text-gray-800 transition-colors">Integrations</button>
                        <ChevronRight className="h-3.5 w-3.5" />
                        <button onClick={() => { setIntegrationView('list'); setSelectedIntegration(null); }} className="hover:text-gray-800 transition-colors">{selectedCategory === 'communication' ? 'Communication' : 'Payments'}</button>
                        <ChevronRight className="h-3.5 w-3.5" />
                        <span className="text-gray-900 font-medium">
                          {selectedIntegration === 'whatsapp' ? 'WhatsApp Messaging' : selectedIntegration === 'stripe' ? 'Stripe' : 'Paystack'}
                        </span>
                      </div>

                      {/* WhatsApp Detail */}
                      {selectedIntegration === 'whatsapp' && (
                        <div className="space-y-6">
                          <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
                            <div className="w-20 h-20 bg-[#25D366] rounded-2xl flex items-center justify-center flex-shrink-0">
                              <SiWhatsapp className="w-10 h-10 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-3 mb-2">
                                <h3 className="text-xl font-bold text-gray-900">WhatsApp Messaging</h3>
                                {(whatsappStatus as any)?.isConfigured ? (
                                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium"><CheckCircle className="h-3 w-3" /> Connected</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-xs font-medium"><AlertCircle className="h-3 w-3" /> Setup Required</span>
                                )}
                              </div>
                              <p className="text-gray-500 text-sm">By Meta / WhatsApp</p>
                              <p className="text-gray-600 text-sm mt-2">Send product promotions, order confirmations, and customer communications directly via WhatsApp. Reach customers where they already are.</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 bg-gray-50 rounded-xl p-4 text-center">
                            <div><p className="text-sm font-semibold text-gray-800">Communication</p><p className="text-xs text-gray-500 mt-0.5">Category</p></div>
                            <div><p className="text-sm font-semibold text-gray-800">Marketing</p><p className="text-xs text-gray-500 mt-0.5">Key function</p></div>
                            <div><p className="text-sm font-semibold text-gray-800">Global</p><p className="text-xs text-gray-500 mt-0.5">Coverage</p></div>
                          </div>
                          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                            {(whatsappStatus as any)?.isConfigured ? (
                              <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 mb-4">
                                <div className="flex items-start gap-3">
                                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                                  <div className="flex-1">
                                    <h5 className="font-medium text-green-900 mb-1">WhatsApp Business API Connected!</h5>
                                    <p className="text-green-800 text-sm mb-2">Your WhatsApp Business API is configured and ready to send messages. You can now:</p>
                                    <ul className="text-green-800 text-sm space-y-1">
                                      <li>• Send product campaigns to customer groups</li>
                                      <li>• Notify customers about order updates</li>
                                      <li>• Share promotional offers directly</li>
                                    </ul>
                                    <div className="mt-3 text-xs text-green-700 bg-green-100 p-2 rounded">
                                      <p><strong>Phone Number ID:</strong> {(whatsappStatus as any)?.phoneNumberId}</p>
                                      {(whatsappStatus as any)?.businessName && <p><strong>Business Name:</strong> {(whatsappStatus as any)?.businessName}</p>}
                                      <p><strong>Access Token:</strong> {(whatsappStatus as any)?.accessToken}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
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
                                      <p className="text-blue-800 text-sm mb-2">⚡ WhatsApp messaging capability is available — just needs activation for your account.</p>
                                      <p className="text-blue-700 text-xs">One-click setup · Uses our managed WhatsApp service · No external accounts needed</p>
                                    </div>
                                    <div className="bg-white border border-blue-200 rounded p-3">
                                      <div className="flex items-center gap-2 mb-1">
                                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                        <span className="font-medium text-blue-900 text-sm">Custom WhatsApp Business API</span>
                                        <Badge variant="outline" className="text-orange-700 border-orange-200 text-xs">Advanced</Badge>
                                      </div>
                                      <p className="text-blue-800 text-sm mb-1">Use your own WhatsApp Business API account (requires Meta approval process)</p>
                                      <p className="text-blue-700 text-xs">For businesses with specific compliance or branding requirements</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">Status:</span>
                                {(whatsappStatus as any)?.isConfigured ? (
                                  <span className="text-green-600 font-medium text-sm">✅ Connected via WhatsApp Business API</span>
                                ) : (
                                  <span className="text-blue-600 font-medium text-sm">⚡ Ready to configure your WhatsApp Business API</span>
                                )}
                              </div>
                              <button
                                onClick={handleWhatsAppConnect}
                                disabled={isConnectingWhatsApp}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <span className="text-sm">{(whatsappStatus as any)?.isConfigured ? 'Reconfigure WhatsApp' : 'Connect WhatsApp Business API'}</span>
                                <MessageSquare className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Stripe Detail */}
                      {selectedIntegration === 'stripe' && (
                        <div className="space-y-6">
                          <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
                            <div className="w-20 h-20 bg-[#6772E5] rounded-2xl flex items-center justify-center flex-shrink-0">
                              <SiStripe className="w-10 h-10 text-white" />
                            </div>
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-3 mb-2">
                                <h3 className="text-xl font-bold text-gray-900">Stripe</h3>
                                {stripeStatus?.accountStatus === 'active' ? (
                                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium"><CheckCircle className="h-3 w-3" /> Connected</span>
                                ) : stripeStatus?.accountStatus === 'incomplete_setup' ? (
                                  <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-xs font-medium"><AlertCircle className="h-3 w-3" /> Setup Required</span>
                                ) : stripeStatus?.accountStatus === 'pending_verification' ? (
                                  <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium"><Clock className="h-3 w-3" /> Pending Verification</span>
                                ) : stripeStatus?.accountStatus === 'error' ? (
                                  <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-medium"><AlertCircle className="h-3 w-3" /> Error</span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full text-xs font-medium">Not Connected</span>
                                )}
                              </div>
                              <p className="text-gray-500 text-sm">By Stripe</p>
                              <p className="text-gray-600 text-sm mt-2">Accept secure card payments and route funds directly to your connected bank account. Payments are processed on your behalf with a 3.3% platform fee.</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 bg-gray-50 rounded-xl p-4 text-center">
                            <div><p className="text-sm font-semibold text-gray-800">3.3%</p><p className="text-xs text-gray-500 mt-0.5">Platform fee</p></div>
                            <div><p className="text-sm font-semibold text-gray-800">Payments</p><p className="text-xs text-gray-500 mt-0.5">Category</p></div>
                            <div><p className="text-sm font-semibold text-gray-800">UK & Europe</p><p className="text-xs text-gray-500 mt-0.5">Coverage</p></div>
                          </div>
                          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 sm:p-4 mb-4">
                              <h5 className="font-medium text-purple-900 mb-2 text-sm sm:text-base">Setup Instructions:</h5>
                              <ol className="list-decimal list-inside text-xs sm:text-sm text-purple-800 space-y-1">
                                <li>Click "Connect Stripe" below to start the Stripe Connect onboarding process</li>
                                <li>Complete business verification with Stripe (identity, bank account, business details)</li>
                                <li>Stripe will verify your information (usually takes 1–2 business days)</li>
                                <li>Once approved, you'll receive payments directly to your connected bank account</li>
                                <li>Webhook endpoints are automatically configured: <code className="bg-purple-100 px-1 rounded text-xs break-all">https://quikpik.app/api/webhooks/stripe</code></li>
                                <li>Test the integration by processing a sample customer order</li>
                              </ol>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                              <div className="flex items-center gap-2">
                                {stripeStatus?.accountStatus === 'active' && <><CheckCircle className="h-4 w-4 text-green-500" /><span className="text-sm text-green-700 font-medium">Connected</span></>}
                                {stripeStatus?.accountStatus === 'incomplete_setup' && <><AlertCircle className="h-4 w-4 text-orange-500" /><span className="text-sm text-orange-700 font-medium">Setup Required</span></>}
                                {stripeStatus?.accountStatus === 'pending_verification' && <><Clock className="h-4 w-4 text-blue-500" /><span className="text-sm text-blue-700 font-medium">Pending Verification</span></>}
                                {(!stripeStatus?.accountStatus || stripeStatus?.accountStatus === 'not_connected') && <><AlertCircle className="h-4 w-4 text-gray-500" /><span className="text-sm text-gray-600">Ready to connect</span></>}
                                {stripeStatus?.accountStatus === 'error' && <><AlertCircle className="h-4 w-4 text-red-500" /><span className="text-sm text-red-700 font-medium">Setup Error</span></>}
                              </div>
                              <button
                                onClick={() => stripeStatus?.accountStatus === 'active' ? handleStripeDashboard() : handleStripeConnect()}
                                disabled={isConnectingStripe}
                                className={`px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto ${stripeStatus?.accountStatus === 'active' ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'}`}
                              >
                                <span className="text-sm">
                                  {isConnectingStripe ? 'Connecting...' :
                                   stripeStatus?.accountStatus === 'active' ? 'Manage Account' :
                                   stripeStatus?.accountStatus === 'incomplete_setup' ? 'Complete Setup' :
                                   stripeStatus?.accountStatus === 'pending_verification' ? 'View Status' : 'Connect Stripe'}
                                </span>
                                {!isConnectingStripe && <ExternalLink className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Paystack Detail */}
                      {selectedIntegration === 'paystack' && (
                        <div className="space-y-6">
                          <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
                            <div className="w-20 h-20 bg-[#00C3A5] rounded-2xl flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-lg leading-none">Pay<br/>stack</span>
                            </div>
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-3 mb-2">
                                <h3 className="text-xl font-bold text-gray-900">Paystack</h3>
                                <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 px-2.5 py-1 rounded-full text-xs font-medium">Coming Soon</span>
                              </div>
                              <p className="text-gray-500 text-sm">By Paystack (a Stripe company)</p>
                              <p className="text-gray-600 text-sm mt-2">Accept payments from customers in Nigeria, Ghana, South Africa and across Africa. Supports cards, bank transfers, USSD and mobile money.</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 bg-gray-50 rounded-xl p-4 text-center">
                            <div><p className="text-sm font-semibold text-gray-800">Payments</p><p className="text-xs text-gray-500 mt-0.5">Category</p></div>
                            <div><p className="text-sm font-semibold text-gray-800">Africa</p><p className="text-xs text-gray-500 mt-0.5">Coverage</p></div>
                            <div><p className="text-sm font-semibold text-gray-800">Cards · Bank · USSD</p><p className="text-xs text-gray-500 mt-0.5">Payment methods</p></div>
                          </div>
                          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                            <h5 className="font-medium text-gray-800 mb-3">What you'll be able to do:</h5>
                            <ul className="space-y-2 text-sm text-gray-600 mb-6">
                              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-gray-300" /> Accept Naira, Cedis and other African currencies</li>
                              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-gray-300" /> Receive payments via card, bank transfer or USSD</li>
                              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-gray-300" /> Automatic payouts to your Nigerian bank account</li>
                              <li className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-gray-300" /> Full order and payment tracking</li>
                            </ul>
                            <button disabled className="w-full sm:w-auto px-6 py-2.5 bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed text-sm font-medium border border-gray-200">
                              Connect Paystack — Available Soon
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
  );
}

// Payment Terms Settings Component
function PaymentTermsSettings({ user }: { user: any }) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState(user?.defaultDepositPercentage || 100);
  const [balanceDueDays, setBalanceDueDays] = useState(user?.balanceDueDays || 0);

  useEffect(() => {
    if (user) {
      setDepositPercentage(user.defaultDepositPercentage || 100);
      setBalanceDueDays(user.balanceDueDays || 0);
    }
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/user/payment-terms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          defaultDepositPercentage: depositPercentage,
          balanceDueDays: balanceDueDays
        })
      });

      if (response.ok) {
        toast({
          title: "Settings Saved",
          description: "Your payment terms have been updated.",
        });
        setIsEditing(false);
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save payment terms.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const depositOptions = [
    { value: 25, label: '25% deposit', description: 'Customer pays 25% upfront, 75% later' },
    { value: 50, label: '50% deposit', description: 'Customer pays 50% upfront, 50% later' },
    { value: 75, label: '75% deposit', description: 'Customer pays 75% upfront, 25% later' },
    { value: 100, label: 'Full payment', description: 'Customer pays 100% upfront' },
  ];

  const dueDaysOptions = [
    { value: 0, label: 'Immediately', description: 'Balance due upon order completion' },
    { value: 7, label: '7 days', description: 'Balance due 7 days after order' },
    { value: 14, label: '14 days', description: 'Balance due 14 days after order' },
    { value: 30, label: '30 days', description: 'Balance due 30 days after order' },
    { value: 60, label: '60 days', description: 'Balance due 60 days after order' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h4 className="font-medium text-gray-800">Default Payment Settings</h4>
          <p className="text-sm text-gray-500 mt-1">These settings apply to new orders</p>
        </div>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setDepositPercentage(user?.defaultDepositPercentage || 100);
                setBalanceDueDays(user?.balanceDueDays || 0);
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {!isEditing ? (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Deposit Required</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {depositPercentage === 100 ? 'Full payment upfront' : `${depositPercentage}% deposit`}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Balance Due In</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {balanceDueDays === 0 ? 'Immediately' : `${balanceDueDays} days`}
            </dd>
          </div>
        </dl>
      ) : (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Deposit Required</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {depositOptions.map((option) => (
                <label
                  key={option.value}
                  className={`
                    flex flex-col p-3 rounded-lg border-2 cursor-pointer transition-all
                    ${depositPercentage === option.value 
                      ? 'border-green-500 bg-green-50' 
                      : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  <input
                    type="radio"
                    name="depositPercentage"
                    value={option.value}
                    checked={depositPercentage === option.value}
                    onChange={() => setDepositPercentage(option.value)}
                    className="sr-only"
                  />
                  <span className="font-medium text-gray-900">{option.label}</span>
                  <span className="text-xs text-gray-500 mt-1">{option.description}</span>
                </label>
              ))}
            </div>
          </div>

          {depositPercentage < 100 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Balance Due In</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {dueDaysOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`
                      flex flex-col p-3 rounded-lg border-2 cursor-pointer transition-all
                      ${balanceDueDays === option.value 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 hover:border-gray-300'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="balanceDueDays"
                      value={option.value}
                      checked={balanceDueDays === option.value}
                      onChange={() => setBalanceDueDays(option.value)}
                      className="sr-only"
                    />
                    <span className="font-medium text-gray-900">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4">
            <h5 className="text-sm font-medium text-gray-700 mb-2">Customer will see:</h5>
            <p className="text-sm text-gray-600">
              {depositPercentage === 100 
                ? '"Full payment required at checkout"'
                : balanceDueDays === 0
                  ? `"${depositPercentage}% deposit now, remaining balance due upon order completion"`
                  : `"${depositPercentage}% deposit now, remaining ${100 - depositPercentage}% due within ${balanceDueDays} days"`
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
