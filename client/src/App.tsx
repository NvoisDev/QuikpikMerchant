import { lazy, Suspense, useEffect } from "react";
import "@/lib/impersonation";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { usePresencePing } from "@/hooks/usePresencePing";
import { OnboardingProvider } from "@/components/OnboardingProvider";
import { ImpersonationProvider } from "@/contexts/impersonation-context";
import ErrorBoundary from "@/components/ErrorBoundary";
import ElephantLoader from "@/components/ui/elephant-loader";

const NotFound = lazy(() => import("@/pages/not-found"));
const Login = lazy(() => import("@/pages/Login"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const CustomerLogin = lazy(() => import("@/pages/CustomerLogin"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const WholesalerDashboard = lazy(() => import("@/pages/wholesaler-dashboard"));
const ProductManagement = lazy(() => import("@/pages/product-management"));
const Checkout = lazy(() => import("@/pages/checkout"));
const Settings = lazy(() => import("@/pages/settings"));
const StripeSuccess = lazy(() => import("@/pages/stripe-success"));
const Marketplace = lazy(() => import("@/pages/marketplace"));
const PublicProductPage = lazy(() => import("@/pages/public-product"));
const OrdersFresh = lazy(() => import("@/pages/orders-fresh"));
const Analytics = lazy(() => import("@/pages/analytics"));
const Help = lazy(() => import("@/pages/help"));
const Campaigns = lazy(() => import("@/pages/campaigns"));
const Financials = lazy(() => import("@/pages/financials"));
const FinancialHealth = lazy(() => import("@/pages/financial-health"));
const CampaignPreview = lazy(() => import("@/pages/campaign-preview"));
const ProductOrderPage = lazy(() => import("@/pages/product-order-page"));
const CustomerPortal = lazy(() => import("@/pages/customer-portal"));
const PaymentSuccess = lazy(() => import("@/pages/payment-success"));
const StockAlerts = lazy(() => import("@/pages/stock-alerts"));
const TeamManagement = lazy(() => import("@/pages/team-management"));
const TeamInvitation = lazy(() => import("@/pages/team-invitation"));
const Signup = lazy(() => import("@/pages/signup"));
const SignupComplete = lazy(() => import("@/pages/signup-complete"));
const WholesalerSelection = lazy(() => import("@/pages/WholesalerSelection"));
const AcceptInvitation = lazy(() => import("@/pages/AcceptInvitation"));
const Customers = lazy(() => import("@/pages/customers"));
const CustomerRegistrationRequests = lazy(() => import("@/pages/customer-registration-requests"));
const AuthSuccess = lazy(() => import("@/pages/auth-success"));
const SuperAdmin = lazy(() => import("@/pages/super-admin"));
const SubscriptionPricing = lazy(() => import("@/pages/SubscriptionPricing"));
const QuickQuote = lazy(() => import("@/pages/quick-quote"));
const CustomerDetail = lazy(() => import("@/pages/customer-detail"));
const Promotions = lazy(() => import("@/pages/promotions"));
const Integrations = lazy(() => import("@/pages/integrations"));
const OrderDetail = lazy(() => import("@/pages/order-detail"));
const ProductDetail = lazy(() => import("@/pages/product-detail"));
const WelcomePage = lazy(() => import("@/pages/WelcomePage"));

import AppLayout from "@/components/layout/app-layout";

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <ElephantLoader message="Loading..." />
  </div>
);

// Lightweight spinner used inside the authenticated layout so the sidebar
// stays visible while a lazy page chunk is loading
const ContentLoader = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      <p className="text-sm text-gray-400">Loading…</p>
    </div>
  </div>
);

// Component for public routes that don't need authentication
function PublicRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/campaign/:id" component={CampaignPreview} />
        <Route path="/marketplace/product/:id" component={ProductOrderPage} />
        <Route path="/product/:slug" component={PublicProductPage} />
        <Route path="/customer/payment-success" component={PaymentSuccess} />
        <Route path="/customer/:id" component={({ params }) => { const [, setLocation] = useLocation(); useEffect(() => { setLocation(`/welcome/${params.id}`, { replace: true }); }, [params.id]); return null; }} />
        <Route path="/welcome/:wholesalerId" component={WelcomePage} />
        <Route path="/customer/:wholesalerId/:customerPhone" component={CustomerPortal} />
        <Route path="/store/:id" component={CustomerPortal} />
        <Route path="/team-invitation" component={TeamInvitation} />
        <Route path="/signup" component={Signup} />
        <Route path="/signup-complete" component={SignupComplete} />
        <Route path="/login" component={Login} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/customer-login" component={CustomerLogin} />
        <Route path="/auth-success" component={AuthSuccess} />
        <Route path="/select-wholesaler" component={WholesalerSelection} />
        <Route path="/accept-invitation/:token" component={({params}) => <AcceptInvitation token={params.token} />} />
        <Route path="/admin" component={SuperAdmin} />
        <Route path="/super-admin" component={SuperAdmin} />
        <Route path="/" component={LandingPage} />
        <Route path="/landing" component={LandingPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// Component for authenticated routes that need authentication
function AuthenticatedRoutes() {
  const { user, isLoading, isAuthenticated } = useAuth();

  usePresencePing(isAuthenticated);

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <AppLayout>
      <Suspense fallback={<ContentLoader />}>
        <Switch>
          <Route path="/marketplace" component={Marketplace} />
          {user && (user.role === 'wholesaler' || user.role === 'team_member') ? (
            <>
              <Route path="/" component={user?.role === 'team_member' ? OrdersFresh : WholesalerDashboard} />
              <Route path="/dashboard" component={WholesalerDashboard} />
              <Route path="/products/:id" component={ProductDetail} />
              <Route path="/products" component={ProductManagement} />
              <Route path="/promotions" component={Promotions} />
              <Route path="/customers/:customerId" component={CustomerDetail} />
              <Route path="/customers" component={Customers} />
              <Route path="/customer-registration-requests" component={CustomerRegistrationRequests} />
              <Route path="/orders/:id" component={OrderDetail} />
              <Route path="/orders" component={OrdersFresh} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/financials" component={Financials} />
              <Route path="/financial-health" component={FinancialHealth} />
              <Route path="/settings" component={Settings} />
              <Route path="/stripe-success" component={StripeSuccess} />
              <Route path="/campaigns" component={Campaigns} />
              <Route path="/broadcasts" component={Campaigns} />
              <Route path="/message-templates" component={Campaigns} />
              <Route path="/stock-alerts" component={StockAlerts} />
              <Route path="/quick-quote" component={QuickQuote} />
              <Route path="/team-management" component={TeamManagement} />
              <Route path="/help" component={Help} />
              <Route path="/subscription-pricing" component={SubscriptionPricing} />
              <Route path="/preview-store" component={CustomerPortal} />
              <Route path="/preview-store/:id" component={CustomerPortal} />
              <Route path="/integrations" component={Integrations} />
            </>
          ) : (
            <>
              <Route path="/checkout" component={Checkout} />
            </>
          )}
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppLayout>
  );
}

function Router() {
  const [location] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  
  // SECURITY: Block customers from accessing wholesaler dashboard
  if (user && (user.role === 'customer' || user.role === 'retailer')) {
    window.location.href = '/customer-login';
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Redirecting...</h2>
          <p className="text-gray-600">Customers cannot access the wholesaler dashboard.</p>
        </div>
      </div>
    );
  }
  
  const publicRoutes = ['/login', '/customer-login', '/landing', '/signup', '/signup-complete', '/auth-success', '/team-invitation', '/forgot-password', '/reset-password', '/admin', '/super-admin'];
  const isPublicRoute = location.startsWith('/campaign/') || 
    location.startsWith('/marketplace/product/') || 
    location.startsWith('/customer/') || 
    location.startsWith('/store/') ||
    location.startsWith('/welcome/') ||
    publicRoutes.includes(location);

  if (location === '/landing') {
    return <PublicRoutes />;
  }
  
  if (isLoading) {
    return <PageLoader />;
  }
  
  if (location === '/') {
    if (isAuthenticated) {
      return <AuthenticatedRoutes />;
    } else {
      return <PublicRoutes />;
    }
  }
  
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
        <ImpersonationProvider>
          <TooltipProvider>
            <OnboardingProvider>
              <Router />
              <Toaster />
            </OnboardingProvider>
          </TooltipProvider>
        </ImpersonationProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
