import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { User, Settings2, Building2, Bell, Upload, Image } from "lucide-react";
import Logo from '@/components/ui/logo';
import { LogoUploader } from '@/components/LogoUploader';
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  
  // Get tab from URL parameter or default to "account"
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const tabFromUrl = urlParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabFromUrl || "account");
  
  // Update active tab when URL changes
  useEffect(() => {
    const urlParams = new URLSearchParams(location.split('?')[1] || '');
    const tabFromUrl = urlParams.get('tab');
    if (tabFromUrl && ['account', 'business', 'notifications'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl);
    }
  }, [location]);

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
