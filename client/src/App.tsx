import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { OnboardingProvider } from "@/components/OnboardingProvider";
import ErrorBoundary from "@/components/ErrorBoundary";

import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import LandingPage from "@/pages/LandingPage";
import CustomerLogin from "@/pages/CustomerLogin";
import WholesalerDashboard from "@/pages/wholesaler-dashboard";
import ProductManagement from "@/pages/product-management";
import RetailerInterface from "@/pages/retailer-interface";
import Checkout from "@/pages/checkout";
import Broadcasts from "@/pages/broadcasts";
import CustomerGroups from "@/pages/customer-groups";
import SubscriptionSettings from "@/pages/subscription-settings";
import Settings from "@/pages/settings";
import Marketplace from "@/pages/marketplace";
import Advertising from "@/pages/advertising";
import AdvertisingPreview from "@/pages/advertising-preview";
import PublicProductPage from "@/pages/public-product";
import Orders from "@/pages/orders";
import Analytics from "@/pages/analytics";
import Help from "@/pages/help";
import MessageTemplates from "@/pages/message-templates";
import Campaigns from "@/pages/campaigns";
import BusinessPerformance from "@/pages/business-performance";
import Financials from "@/pages/financials";
import FinancialHealth from "@/pages/financial-health";
import CampaignPreview from "@/pages/campaign-preview";
import ProductOrderPage from "@/pages/product-order-page";
import CustomerPortal from "@/pages/customer-portal";
import PaymentSuccess from "@/pages/payment-success";
import StockAlerts from "@/pages/stock-alerts";
import TeamManagement from "@/pages/team-management";
import TeamInvitation from "@/pages/team-invitation";
import Signup from "@/pages/signup";
import ShippingSettings from "@/pages/shipping-settings";
import ShippingTracking from "@/pages/shipping-tracking";
import Customers from "@/pages/customers";
import AppLayout from "@/components/layout/app-layout";

// Component for public routes that don't need authentication
function PublicRoutes() {
  return (
    <Switch>
      <Route path="/campaign/:id" component={CampaignPreview} />
      <Route path="/marketplace/product/:id" component={ProductOrderPage} />
      <Route path="/product/:slug" component={PublicProductPage} />
      <Route path="/customer/:id" component={CustomerLogin} />
      <Route path="/store/:id" component={CustomerPortal} />
      <Route path="/customer/payment-success" component={PaymentSuccess} />
      <Route path="/team-invitation" component={TeamInvitation} />
      <Route path="/signup" component={Signup} />
      <Route path="/login" component={Login} />
      <Route path="/customer-login" component={CustomerLogin} />
      <Route path="/advertising-preview" component={AdvertisingPreview} />
      <Route path="/" component={LandingPage} />
      <Route path="/landing" component={LandingPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Component for authenticated routes that need authentication
function AuthenticatedRoutes() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/marketplace" component={Marketplace} />
        <Route path="/advertising" component={Advertising} />
        {user && (user.role === 'wholesaler' || user.role === 'team_member') ? (
          <>
            <Route path="/" component={WholesalerDashboard} />
            <Route path="/dashboard" component={WholesalerDashboard} />
            <Route path="/products" component={ProductManagement} />
            <Route path="/customers" component={Customers} />
            <Route path="/orders" component={Orders} />
            <Route path="/subscription" component={SubscriptionSettings} />
            <Route path="/subscription-settings" component={SubscriptionSettings} />
            <Route path="/analytics" component={Analytics} />
            <Route path="/business-performance" component={BusinessPerformance} />
            <Route path="/financials" component={Financials} />
            <Route path="/financial-health" component={FinancialHealth} />
            <Route path="/settings" component={Settings} />
            <Route path="/campaigns" component={Campaigns} />
            {/* Legacy route redirect */}
            <Route path="/broadcasts" component={Campaigns} />
            <Route path="/message-templates" component={Campaigns} />
            <Route path="/stock-alerts" component={StockAlerts} />
            <Route path="/team-management" component={TeamManagement} />
            <Route path="/help" component={Help} />
            <Route path="/preview-store" component={CustomerPortal} />
          </>
        ) : (
          <>
            <Route path="/" component={RetailerInterface} />
            <Route path="/orders" component={Orders} />
            <Route path="/checkout" component={Checkout} />
          </>
        )}
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function Router() {
  const [location] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  
  // Check if current route is public (doesn't need authentication)
  const publicRoutes = ['/login', '/customer-login', '/landing', '/signup', '/team-invitation', '/advertising-preview'];
  const isPublicRoute = location.startsWith('/campaign/') || 
    location.startsWith('/marketplace/product/') || 
    location.startsWith('/customer/') || 
    location.startsWith('/store/') || // Add /store/ routes as public
    publicRoutes.includes(location);
  
  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  
  // Handle root path based on authentication status
  if (location === '/') {
    if (isAuthenticated) {
      return <AuthenticatedRoutes />;
    } else {
      return <PublicRoutes />;
    }
  }
  
  // Route to public or authenticated routes based on current path
  if (isPublicRoute) {
    return <PublicRoutes />;
  } else {
    return <AuthenticatedRoutes />;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <OnboardingProvider>
            <Router />
            <Toaster />
          </OnboardingProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
