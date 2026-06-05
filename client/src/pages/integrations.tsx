import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/hooks/useAuth";
import { useSidebarPermissions } from "@/hooks/useSidebarPermissions";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { WhatsAppSetupModal } from "@/components/WhatsAppSetupModal";
import { SiWhatsapp, SiStripe } from "react-icons/si";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  MessageSquare,
  CreditCard,
  ChevronRight,
  ExternalLink,
  Calculator,
} from "lucide-react";

export default function Integrations() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { checkTabAccess, permissionsLoading } = useSidebarPermissions();

  useEffect(() => {
    if (permissionsLoading) return;
    if (user?.role === 'team_member' && !checkTabAccess('integrations')) {
      toast({
        title: "Access restricted",
        description: "You don't have permission to view the Integrations page.",
        variant: "destructive",
      });
      setLocation('/');
    }
  }, [user, permissionsLoading, checkTabAccess, toast, setLocation]);

  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [isConnectingWhatsApp, setIsConnectingWhatsApp] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);

  // Read ?category= query param on mount so deep links like /integrations?category=payment work
  const VALID_CATEGORIES = ['communication', 'payment', 'accounting'] as const;
  type ValidCategory = typeof VALID_CATEGORIES[number];
  const [selectedCategory, setSelectedCategory] = useState<ValidCategory | null>(() => {
    const cat = new URLSearchParams(window.location.search).get('category');
    return (VALID_CATEGORIES as readonly string[]).includes(cat ?? '') ? (cat as ValidCategory) : null;
  });
  const [integrationView, setIntegrationView] = useState<'categories' | 'list' | 'detail'>(() => {
    const cat = new URLSearchParams(window.location.search).get('category');
    return (VALID_CATEGORIES as readonly string[]).includes(cat ?? '') ? 'list' : 'categories';
  });
  const [selectedIntegration, setSelectedIntegration] = useState<'whatsapp' | 'stripe' | 'paystack' | null>(null);

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

  type WhatsAppStatus = { isConfigured?: boolean; userActivated?: boolean; platformCapable?: boolean; provider?: string; phoneNumberId?: string; businessName?: string; accessToken?: string };
  const { data: whatsappStatus, refetch: refetchWhatsApp } = useQuery<WhatsAppStatus>({
    queryKey: ["/api/whatsapp/status"],
    staleTime: 30 * 1000,
  });

  const handleStripeConnect = async () => {
    setIsConnectingStripe(true);
    try {
      let response = await apiRequest('POST', '/api/stripe/connect');
      let data = await response.json();

      if (response.status === 401 && (data.retry || data.needsRefresh)) {
        toast({
          title: "Session Refresh",
          description: "Refreshing your session. Please try again in a moment.",
        });
        setTimeout(() => { window.location.reload(); }, 1500);
        return;
      }

      if (data.url) {
        window.open(data.url, '_blank');
        toast({
          title: "Stripe Connect",
          description: "Opening Stripe account setup in a new window. Complete all steps to start accepting payments.",
        });
        setTimeout(() => { refetchStripeStatus(); }, 3000);
      }
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: "Unable to connect to Stripe. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnectingStripe(false);
    }
  };

  const handleStripeDashboard = async () => {
    setIsConnectingStripe(true);
    try {
      const response = await apiRequest('POST', '/api/stripe/dashboard');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.url) {
        const newWindow = window.open(data.url, '_blank');
        if (!newWindow) throw new Error("Pop-up blocked. Please allow pop-ups for this site.");
        toast({
          title: "Stripe Dashboard",
          description: "Opening your Stripe account dashboard in a new window.",
        });
        setTimeout(() => { refetchStripeStatus(); }, 2000);
      } else {
        throw new Error("Dashboard URL not provided");
      }
    } catch (error: any) {
      toast({
        title: "Dashboard Error",
        description: error.message || "Unable to open Stripe dashboard. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnectingStripe(false);
    }
  };

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
        await refetchWhatsApp();
        setShowWhatsAppModal(false);
        toast({
          title: "WhatsApp Connected!",
          description: "Your WhatsApp Business API is now configured and ready to send messages.",
        });
      } else {
        throw new Error(data.message || "Configuration failed");
      }
    } catch (error) {
      toast({
        title: "Configuration Failed",
        description: "Unable to configure WhatsApp Business API. Please verify your credentials and try again.",
        variant: "destructive",
      });
    } finally {
      setIsConnectingWhatsApp(false);
    }
  };

  const handleWhatsAppActivation = async () => {
    try {
      setIsConnectingWhatsApp(true);

      if (whatsappStatus?.userActivated) {
        toast({
          title: "WhatsApp Already Active",
          description: "Your WhatsApp messaging is already active and ready to use for campaigns.",
        });
        return;
      }

      if (!whatsappStatus?.platformCapable) {
        toast({
          title: "WhatsApp Not Available",
          description: "WhatsApp platform capability is not currently available. Please contact support.",
          variant: "destructive",
        });
        return;
      }

      const response = await apiRequest('POST', '/api/whatsapp/activate', {
        provider: 'platform'
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          await refetchWhatsApp();
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <PageHeader title="Integrations" description="Connect your business tools to streamline operations" />
      <div className="p-4 sm:p-6">

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
              <p className="text-gray-500 text-sm">Browse categories to connect your tools.</p>
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

              {/* Accounting */}
              <button
                onClick={() => { setSelectedCategory('accounting'); setIntegrationView('list'); }}
                className="text-left border border-gray-200 rounded-xl p-5 hover:border-teal-400 hover:shadow-md transition-all group bg-white"
              >
                <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-teal-200 transition-colors">
                  <Calculator className="w-6 h-6 text-teal-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-1">Accounting</h4>
                <p className="text-sm text-gray-500">Xero · Sync invoices and financial data</p>
                <div className="mt-3 flex items-center text-teal-600 text-sm font-medium">
                  <span>1 integration</span>
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
              <span className="text-gray-900 font-medium">{selectedCategory === 'communication' ? 'Communication' : selectedCategory === 'accounting' ? 'Accounting' : 'Payments'}</span>
            </div>

            {selectedCategory === 'communication' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="text-left border border-gray-200 rounded-xl overflow-hidden bg-white opacity-70 cursor-not-allowed">
                  <div className="bg-[#25D366] h-28 flex items-center justify-center relative">
                    <SiWhatsapp className="w-12 h-12 text-white" />
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-semibold text-gray-900 text-sm">WhatsApp Messaging</span>
                      <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs font-medium shrink-0">
                        Coming Soon
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">Send campaigns, order updates and promotions via WhatsApp.</p>
                    <p className="text-xs text-gray-400 mt-2">Communication · Marketing</p>
                  </div>
                </div>
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
                    <p className="text-xs text-gray-400 mt-2">Payments · UK, Europe, US & Canada</p>
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

            {selectedCategory === 'accounting' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="text-left border border-gray-200 rounded-xl overflow-hidden bg-white opacity-75">
                  <div className="bg-[#13B5EA] h-28 flex items-center justify-center">
                    <span className="text-white font-bold text-3xl tracking-tight" style={{ fontFamily: 'serif' }}>xero</span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <span className="font-semibold text-gray-900 text-sm">Xero</span>
                      <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs font-medium shrink-0">Coming Soon</span>
                    </div>
                    <p className="text-xs text-gray-500">Automatically sync invoices, payments and financial data with your Xero account.</p>
                    <p className="text-xs text-gray-400 mt-2">Accounting · UK, Global</p>
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
              <button onClick={() => { setIntegrationView('list'); setSelectedIntegration(null); }} className="hover:text-gray-800 transition-colors">{selectedCategory === 'communication' ? 'Communication' : selectedCategory === 'accounting' ? 'Accounting' : 'Payments'}</button>
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
                      {whatsappStatus?.isConfigured ? (
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
                  {whatsappStatus?.isConfigured ? (
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
                            <p><strong>Phone Number ID:</strong> {whatsappStatus?.phoneNumberId}</p>
                            {whatsappStatus?.businessName && <p><strong>Business Name:</strong> {whatsappStatus?.businessName}</p>}
                            <p><strong>Access Token:</strong> {whatsappStatus?.accessToken}</p>
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
                      {whatsappStatus?.isConfigured ? (
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
                      <span className="text-sm">{whatsappStatus?.isConfigured ? 'Reconfigure WhatsApp' : 'Connect WhatsApp Business API'}</span>
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
                    <p className="text-gray-600 text-sm mt-2">Accept secure card payments and route funds directly to your connected bank account. Payments are processed on your behalf with a small platform service fee.</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 bg-gray-50 rounded-xl p-4 text-center">
                  <div><p className="text-sm font-semibold text-gray-800">Service Fee</p><p className="text-xs text-gray-500 mt-0.5">Platform fee</p></div>
                  <div><p className="text-sm font-semibold text-gray-800">Payments</p><p className="text-xs text-gray-500 mt-0.5">Category</p></div>
                  <div><p className="text-sm font-semibold text-gray-800">UK, Europe, US & Canada</p><p className="text-xs text-gray-500 mt-0.5">Coverage</p></div>
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
    </div>
  );
}
