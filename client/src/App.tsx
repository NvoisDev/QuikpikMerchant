import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import WholesalerDashboard from "@/pages/wholesaler-dashboard";
import ProductManagement from "@/pages/product-management";
import RetailerInterface from "@/pages/retailer-interface";
import Checkout from "@/pages/checkout";
import Broadcasts from "@/pages/broadcasts";
import CustomerGroups from "@/pages/customer-groups";
import Subscription from "@/pages/subscription";
import Settings from "@/pages/settings";
import Marketplace from "@/pages/marketplace";
import Orders from "@/pages/orders";
import Analytics from "@/pages/analytics";
import Help from "@/pages/help";
import MessageTemplates from "@/pages/message-templates";
import Campaigns from "@/pages/campaigns";
import BusinessPerformance from "@/pages/business-performance";
import Financials from "@/pages/financials";
import AppLayout from "@/components/layout/app-layout";

function Router() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <AppLayout>
          <Route path="/marketplace" component={Marketplace} />
          {user && user.role === 'wholesaler' ? (
            <>
              <Route path="/" component={WholesalerDashboard} />
              <Route path="/products" component={ProductManagement} />
              <Route path="/customer-groups" component={CustomerGroups} />
              <Route path="/orders" component={Orders} />
              <Route path="/subscription" component={Subscription} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/business-performance" component={BusinessPerformance} />
              <Route path="/financials" component={Financials} />
              <Route path="/settings" component={Settings} />
              <Route path="/campaigns" component={Campaigns} />
              {/* Legacy route redirect */}
              <Route path="/broadcasts" component={Campaigns} />
              <Route path="/message-templates" component={Campaigns} />
              <Route path="/help" component={Help} />
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
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
