import { User, Settings, X, Check, MapPin, Palette, TrendingUp, HelpCircle, Mail, Phone, Building } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeliveryAddressManager } from "@/components/customer/DeliveryAddressManager";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { TabQuickActions } from "./TabQuickActions";
import type { CartItem, WholesalerPortal, CustomerOrderStats } from "@/components/customer/portal-types";
import { formatCurrency } from "@/lib/currencies";

interface AccountTabProps {
  setActiveTab: (tab: string) => void;
  cart: CartItem[];
  setShowCheckout: (show: boolean) => void;
  isCreatingIntent: boolean;
  handleLogout: () => void;
  isEnhancedPreviewMode: boolean;
  isEditingProfile: boolean;
  editedProfile: { name: string; email: string; phone: string; businessName: string };
  setEditedProfile: (profile: { name: string; email: string; phone: string; businessName: string }) => void;
  initializeEditForm: () => void;
  setIsEditingProfile: (v: boolean) => void;
  handleSaveProfile: () => void;
  updateProfileMutation: { isPending: boolean };
  customerData: { name: string; email: string; phone: string; businessName?: string };
  wholesaler: WholesalerPortal | null;
  customerOrderStats: CustomerOrderStats | null;
}

export function AccountTab({
  setActiveTab,
  cart,
  setShowCheckout,
  isCreatingIntent,
  handleLogout,
  isEnhancedPreviewMode,
  isEditingProfile,
  editedProfile,
  setEditedProfile,
  initializeEditForm,
  setIsEditingProfile,
  handleSaveProfile,
  updateProfileMutation,
  customerData,
  wholesaler,
  customerOrderStats,
}: AccountTabProps) {
  return (
    <>
      <TabQuickActions
        setActiveTab={setActiveTab}
        cart={cart}
        setShowCheckout={setShowCheckout}
        isCreatingIntent={isCreatingIntent}
        handleLogout={handleLogout}
      />

      {isEnhancedPreviewMode ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500">
          <User className="w-12 h-12 mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">Account Settings</h3>
          <p className="text-sm text-gray-400">This section is not available in preview mode.<br />Customers manage their details when logged into their own session.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <h2 className="text-2xl font-bold">Account Settings</h2>

          {/* User Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Information
                </div>
                {!isEditingProfile ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={initializeEditForm}
                    className="gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingProfile(false)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveProfile}
                      disabled={updateProfileMutation.isPending}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {updateProfileMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isEditingProfile ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Name</Label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md">
                      {customerData.name || 'Not provided'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Email</Label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md">
                      {customerData.email || 'Not provided'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Phone</Label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md">
                      {customerData.phone || 'Not provided'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Business</Label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-md">
                      {customerData?.businessName || 'Not provided'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Name</Label>
                    <Input
                      value={editedProfile.name}
                      onChange={(e) => setEditedProfile({...editedProfile, name: e.target.value})}
                      placeholder="Enter your name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Email</Label>
                    <Input
                      value={editedProfile.email}
                      onChange={(e) => setEditedProfile({...editedProfile, email: e.target.value})}
                      placeholder="Enter your email"
                      type="email"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Phone</Label>
                    <Input
                      value={editedProfile.phone}
                      onChange={(e) => setEditedProfile({...editedProfile, phone: e.target.value})}
                      placeholder="Enter your phone"
                      type="tel"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Business Name</Label>
                    <Input
                      value={editedProfile.businessName}
                      onChange={(e) => setEditedProfile({...editedProfile, businessName: e.target.value})}
                      placeholder="Enter business name"
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delivery Addresses */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Delivery Addresses
              </CardTitle>
              <p className="text-sm text-gray-600">
                Manage your delivery addresses for faster checkout
              </p>
            </CardHeader>
            <CardContent>
              {wholesaler?.id && (
                <DeliveryAddressManager
                  wholesalerId={wholesaler.id}
                  showAddButton={true}
                />
              )}
            </CardContent>
          </Card>

          {/* Theme Preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Theme Preferences
              </CardTitle>
              <p className="text-sm text-gray-600">
                Customize your shopping experience with different color themes
              </p>
            </CardHeader>
            <CardContent>
              <ThemeSwitcher />
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Your Shopping Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-theme-primary">
                    {customerOrderStats?.totalOrders || 0}
                  </div>
                  <div className="text-sm text-gray-600">Total Orders</div>
                </div>
                <div className="text-center p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-theme-primary">
                    {formatCurrency(customerOrderStats?.totalSpent || 0, wholesaler?.defaultCurrency || 'GBP')}
                  </div>
                  <div className="text-sm text-gray-600">Total Spent</div>
                </div>
                <div className="text-center p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div className="text-2xl font-bold text-theme-primary">{cart.length}</div>
                  <div className="text-sm text-gray-600">Items in Cart</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Support Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                Need Help?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="text-sm">Email: {wholesaler?.email || 'hello@quikpik.co'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-gray-400" />
                <span className="text-sm">Phone: {wholesaler?.businessPhone || wholesaler?.phoneNumber}</span>
              </div>
              <div className="flex items-center gap-3">
                <Building className="h-4 w-4 text-gray-400" />
                <span className="text-sm">Business: {wholesaler?.businessName || 'Surulere Foods Wholesale'}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
