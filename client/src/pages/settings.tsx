import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { User, Settings2, Building2, Bell, Puzzle, Lock, Shield } from "lucide-react";
import { useCheckTabAccess } from "@/hooks/useTabPermissions";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { CustomerProfileNotifications } from "@/components/wholesaler/CustomerProfileNotifications";

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("account");
  
  // Check access permissions for different settings sections
  const { data: accountAccess } = useCheckTabAccess("account-settings");
  const { data: businessAccess } = useCheckTabAccess("business-settings");
  const { data: notificationAccess } = useCheckTabAccess("notification-settings");
  const { data: integrationAccess } = useCheckTabAccess("integration-settings");

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

  // Helper function to check if user has access to a tab
  const hasAccess = (access: { hasAccess: boolean } | undefined) => {
    // Default to true for backwards compatibility if API not available
    // or if user is owner/admin (main wholesaler account)
    return access?.hasAccess !== false || user.role === 'wholesaler';
  };

  // Determine user role display
  const getUserRoleDisplay = () => {
    if (user.role === 'wholesaler') return 'Account Owner';
    // Check if user has team member info in session/user object
    const teamRole = (user as any).teamMemberRole;
    if (teamRole === 'admin') return 'Team Admin';
    if (teamRole === 'member') return 'Team Member';
    return 'User';
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
                  className={`flex items-center p-3 rounded-lg ${
                    hasAccess(accountAccess) 
                      ? `cursor-pointer ${
                          activeTab === "account" 
                            ? "bg-blue-50 text-blue-700" 
                            : "text-gray-600 hover:bg-gray-50"
                        }`
                      : "text-gray-400 bg-gray-50 cursor-not-allowed"
                  }`}
                  onClick={() => hasAccess(accountAccess) && setActiveTab("account")}
                >
                  <User className="h-5 w-5 mr-3" />
                  <span className="font-medium">Account</span>
                  {!hasAccess(accountAccess) && <Lock className="h-4 w-4 ml-auto" />}
                </div>

                {/* Business Settings */}
                <div 
                  className={`flex items-center p-3 rounded-lg ${
                    hasAccess(businessAccess) 
                      ? `cursor-pointer ${
                          activeTab === "business" 
                            ? "bg-blue-50 text-blue-700" 
                            : "text-gray-600 hover:bg-gray-50"
                        }`
                      : "text-gray-400 bg-gray-50 cursor-not-allowed"
                  }`}
                  onClick={() => hasAccess(businessAccess) && setActiveTab("business")}
                >
                  <Building2 className="h-5 w-5 mr-3" />
                  <span>Business</span>
                  {!hasAccess(businessAccess) && <Lock className="h-4 w-4 ml-auto" />}
                </div>

                {/* Notification Settings */}
                <div 
                  className={`flex items-center p-3 rounded-lg ${
                    hasAccess(notificationAccess) 
                      ? `cursor-pointer ${
                          activeTab === "notifications" 
                            ? "bg-blue-50 text-blue-700" 
                            : "text-gray-600 hover:bg-gray-50"
                        }`
                      : "text-gray-400 bg-gray-50 cursor-not-allowed"
                  }`}
                  onClick={() => hasAccess(notificationAccess) && setActiveTab("notifications")}
                >
                  <Bell className="h-5 w-5 mr-3" />
                  <span>Notifications</span>
                  {!hasAccess(notificationAccess) && <Lock className="h-4 w-4 ml-auto" />}
                </div>
                
                {/* Integration Settings */}
                <div 
                  className={`flex items-center p-3 rounded-lg ${
                    hasAccess(integrationAccess) 
                      ? `cursor-pointer ${
                          activeTab === "integrations" 
                            ? "bg-blue-50 text-blue-700" 
                            : "text-gray-600 hover:bg-gray-50"
                        }`
                      : "text-gray-400 bg-gray-50 cursor-not-allowed"
                  }`}
                  onClick={() => hasAccess(integrationAccess) && setActiveTab("integrations")}
                >
                  <Puzzle className="h-5 w-5 mr-3" />
                  <span>Integrations</span>
                  {!hasAccess(integrationAccess) && <Lock className="h-4 w-4 ml-auto" />}
                </div>

                {/* Role display */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center text-sm text-gray-600">
                    <Shield className="h-4 w-4 mr-2" />
                    <span>{getUserRoleDisplay()}</span>
                  </div>
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
                  {!hasAccess(accountAccess) ? (
                    <Alert>
                      <Lock className="h-4 w-4" />
                      <AlertDescription>
                        You don't have permission to access account settings. Contact your account owner or team admin to request access.
                      </AlertDescription>
                    </Alert>
                  ) : (
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
                  )}
                </div>
              )}

              {activeTab === "business" && (
                <div className="space-y-6">
                  {!hasAccess(businessAccess) ? (
                    <Alert>
                      <Lock className="h-4 w-4" />
                      <AlertDescription>
                        You don't have permission to access business settings. Contact your account owner or team admin to request access.
                      </AlertDescription>
                    </Alert>
                  ) : (
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
                  )}
                </div>
              )}

              {activeTab === "notifications" && (
                <div className="space-y-6">
                  {!hasAccess(notificationAccess) ? (
                    <Alert>
                      <Lock className="h-4 w-4" />
                      <AlertDescription>
                        You don't have permission to access notification settings. Contact your account owner or team admin to request access.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              )}

              {activeTab === "integrations" && (
                <div className="space-y-6">
                  {!hasAccess(integrationAccess) ? (
                    <Alert>
                      <Lock className="h-4 w-4" />
                      <AlertDescription>
                        You don't have permission to access integration settings. Contact your account owner or team admin to request access.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="text-center py-8">
                      <Puzzle className="mx-auto h-12 w-12 text-gray-400" />
                      <h3 className="mt-2 text-lg font-medium text-gray-900">Integration Settings</h3>
                      <p className="mt-1 text-gray-500">
                        Integration management will be available in a future update.
                      </p>
                      <p className="mt-2 text-sm text-gray-400">
                        Contact support for assistance with WhatsApp or payment integrations.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

