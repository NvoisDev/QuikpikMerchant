import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { OnboardingProvider } from "@/components/OnboardingProvider";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/Login";
import LandingPage from "@/pages/LandingPage";
import WholesalerDashboard from "@/pages/wholesaler-dashboard";
import ProductManagement from "@/pages/product-management";
import RetailerInterface from "@/pages/retailer-interface";
import Checkout from "@/pages/checkout";
import Broadcasts from "@/pages/broadcasts";
import CustomerGroups from "@/pages/customer-groups";
import SubscriptionSettings from "@/pages/subscription-settings";
import Settings from "@/pages/settings";
import Marketplace from "@/pages/marketplace";
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
import AppLayout from "@/components/layout/app-layout";

function Router() {
  const [location] = useLocation();
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show login page only for /login route when not authenticated
  const isPublicRoute = ['/login', '/campaign/', '/marketplace/product/', '/customer/'].some(route => location.includes(route));
  
  if (!isAuthenticated && location === '/login') {
    return <Login />;
  }

  return (
    <Switch>
      {/* Public routes - accessible without authentication */}
      <Route path="/campaign/:id" component={CampaignPreview} />
      <Route path="/marketplace/product/:id" component={ProductOrderPage} />
      <Route path="/customer/:id?" component={CustomerPortal} />
      <Route path="/customer/payment-success" component={PaymentSuccess} />
      <Route path="/team-invitation" component={TeamInvitation} />
      
      {!isAuthenticated ? (
        <Route path="/" component={LandingPage} />
      ) : (
        <AppLayout>
          <Route path="/marketplace" component={Marketplace} />
          {user && user.role === 'wholesaler' ? (
            <>
              <Route path="/" component={WholesalerDashboard} />
              <Route path="/products" component={ProductManagement} />
              <Route path="/customer-groups" component={CustomerGroups} />
              <Route path="/orders" component={Orders} />
              <Route path="/subscription" component={SubscriptionSettings} />
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
        </AppLayout>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <OnboardingProvider>
          <Toaster />
          <Router />
        </OnboardingProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
