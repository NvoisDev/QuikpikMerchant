import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { User, Settings2, Building2, Bell, Puzzle, ExternalLink } from "lucide-react";
import { SiWhatsapp, SiStripe } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("account");
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

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
                          <span className="text-sm text-gray-500">Status: Not configured</span>
                          <button 
                            onClick={handleWhatsAppConfig}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                          >
                            <span>Configure WhatsApp</span>
                            <ExternalLink className="h-4 w-4" />
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
                            onClick={handleStripeConnect}
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

