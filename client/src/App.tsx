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
import Subscription from "@/pages/subscription";
import Marketplace from "@/pages/marketplace";

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
        <>
          <Route path="/marketplace" component={Marketplace} />
          {user && user.role === 'wholesaler' ? (
            <>
              <Route path="/" component={WholesalerDashboard} />
              <Route path="/products" component={ProductManagement} />
              <Route path="/broadcasts" component={Broadcasts} />
              <Route path="/subscription" component={Subscription} />
            </>
          ) : (
            <>
              <Route path="/" component={RetailerInterface} />
              <Route path="/checkout" component={Checkout} />
            </>
          )}
        </>
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
